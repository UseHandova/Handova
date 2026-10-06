// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {RentFlowEscrow} from "../RentFlowEscrow.sol";
import {RentFlowNFT} from "../RentFlowNFT.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract RentFlowEscrowTest is Test {
    RentFlowEscrow escrow;
    RentFlowNFT nft;
    MockUSDC usdc;

    address owner = address(this);
    address landlord = makeAddr("landlord");
    address tenant = makeAddr("tenant");
    address stranger = makeAddr("stranger");
    address arbiter = makeAddr("arbiter");

    uint256 constant RENT = 1_000e6;
    uint256 constant DEPOSIT = 200e6;

    function setUp() public {
        usdc = new MockUSDC();
        escrow = new RentFlowEscrow(address(usdc));
        nft = new RentFlowNFT(address(escrow));
        escrow.setNftContract(address(nft));
        escrow.setArbiter(arbiter);

        usdc.mint(tenant, 10_000e6);
        vm.prank(tenant);
        usdc.approve(address(escrow), type(uint256).max);
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    function _list() internal returns (uint256 listingId) {
        vm.prank(landlord);
        listingId = escrow.createListing(RENT, DEPOSIT, "ipfs://listing");
    }

    function _deposit() internal returns (uint256 escrowId) {
        uint256 listingId = _list();
        vm.prank(tenant);
        escrowId = escrow.depositRent(listingId);
    }

    function _active() internal returns (uint256 escrowId) {
        escrowId = _deposit();
        vm.prank(tenant);
        escrow.confirmMoveIn(escrowId);
    }

    function _status(uint256 escrowId) internal view returns (RentFlowEscrow.EscrowStatus status) {
        (,,, status,) = escrow.escrows(escrowId);
    }

    function _held(uint256 escrowId) internal view returns (uint256 held) {
        (,, held,,) = escrow.escrows(escrowId);
    }

    // ── happy path ───────────────────────────────────────────────────────────

    function test_depositHoldsRentPlusDeposit() public {
        uint256 id = _deposit();
        assertEq(_held(id), RENT + DEPOSIT);
        assertEq(usdc.balanceOf(address(escrow)), RENT + DEPOSIT);
        assertEq(uint8(_status(id)), uint8(RentFlowEscrow.EscrowStatus.Pending));
    }

    function test_confirmMoveInReleasesRentAndMintsNft() public {
        uint256 id = _active();
        assertEq(escrow.pendingWithdrawals(landlord), RENT);
        assertEq(_held(id), DEPOSIT);
        assertEq(nft.ownerOf(nft.escrowToTokenId(id)), tenant);

        vm.prank(landlord);
        escrow.withdraw();
        assertEq(usdc.balanceOf(landlord), RENT);
    }

    // ── exploit 1: tenant could take the deposit back instantly ─────────────

    function test_endTenancyDoesNotRefundInstantly() public {
        uint256 id = _active();
        vm.prank(tenant);
        escrow.endTenancy(id);

        assertEq(escrow.pendingWithdrawals(tenant), 0);
        assertEq(_held(id), DEPOSIT);
        assertEq(uint8(_status(id)), uint8(RentFlowEscrow.EscrowStatus.Ending));
    }

    function test_landlordApprovesDepositReturn() public {
        uint256 id = _active();
        vm.prank(tenant);
        escrow.endTenancy(id);

        vm.prank(landlord);
        escrow.approveDepositReturn(id);

        assertEq(escrow.pendingWithdrawals(tenant), DEPOSIT);
        assertEq(uint8(_status(id)), uint8(RentFlowEscrow.EscrowStatus.Refunded));
        assertEq(escrow.listingToEscrowId(1), 0);
    }

    function test_tenantClaimsDepositAfterSilentReview() public {
        uint256 id = _active();
        vm.prank(tenant);
        escrow.endTenancy(id);

        vm.prank(tenant);
        vm.expectRevert(abi.encodeWithSelector(RentFlowEscrow.DepositReviewOpen.selector, id));
        escrow.claimDeposit(id);

        vm.warp(block.timestamp + escrow.DEPOSIT_REVIEW_PERIOD());
        vm.prank(tenant);
        escrow.claimDeposit(id);
        assertEq(escrow.pendingWithdrawals(tenant), DEPOSIT);
    }

    function test_landlordCanDisputeDuringReview() public {
        uint256 id = _active();
        vm.prank(tenant);
        escrow.endTenancy(id);

        vm.prank(landlord);
        escrow.dispute(id);
        assertEq(uint8(_status(id)), uint8(RentFlowEscrow.EscrowStatus.Disputed));

        vm.warp(block.timestamp + escrow.DEPOSIT_REVIEW_PERIOD());
        vm.prank(tenant);
        vm.expectRevert(abi.encodeWithSelector(RentFlowEscrow.InvalidEscrowState.selector, id));
        escrow.claimDeposit(id);
    }

    function test_onlyLandlordApprovesDepositReturn() public {
        uint256 id = _active();
        vm.prank(tenant);
        escrow.endTenancy(id);

        vm.prank(tenant);
        vm.expectRevert(abi.encodeWithSelector(RentFlowEscrow.NotLandlord.selector, tenant));
        escrow.approveDepositReturn(id);
    }

    function test_endTenancyWithZeroDepositRefundsImmediately() public {
        vm.prank(landlord);
        uint256 listingId = escrow.createListing(RENT, 0, "ipfs://listing");
        vm.startPrank(tenant);
        uint256 id = escrow.depositRent(listingId);
        escrow.confirmMoveIn(id);
        escrow.endTenancy(id);
        vm.stopPrank();
        assertEq(uint8(_status(id)), uint8(RentFlowEscrow.EscrowStatus.Refunded));
    }

    // ── exploit 2: tenant moves in, never confirms, pulls rent back ─────────

    function test_cancelExpiredBlockedAfterHandover() public {
        uint256 id = _deposit();
        vm.prank(landlord);
        escrow.markHandover(id);

        vm.warp(block.timestamp + escrow.DISPUTE_TIMEOUT());
        vm.prank(tenant);
        vm.expectRevert(abi.encodeWithSelector(RentFlowEscrow.EscrowNotClaimable.selector, id));
        escrow.cancelExpired(id);
    }

    function test_landlordClaimsMoveInAfterSilentTenant() public {
        uint256 id = _deposit();
        vm.prank(landlord);
        escrow.markHandover(id);

        vm.prank(landlord);
        vm.expectRevert(abi.encodeWithSelector(RentFlowEscrow.MoveInWindowOpen.selector, id));
        escrow.claimMoveIn(id);

        vm.warp(block.timestamp + escrow.MOVE_IN_WINDOW());
        vm.prank(landlord);
        escrow.claimMoveIn(id);

        assertEq(uint8(_status(id)), uint8(RentFlowEscrow.EscrowStatus.Active));
        assertEq(escrow.pendingWithdrawals(landlord), RENT);
        assertEq(nft.ownerOf(nft.escrowToTokenId(id)), tenant);
    }

    function test_claimMoveInRequiresHandover() public {
        uint256 id = _deposit();
        vm.warp(block.timestamp + 30 days);
        vm.prank(landlord);
        vm.expectRevert(abi.encodeWithSelector(RentFlowEscrow.HandoverNotMarked.selector, id));
        escrow.claimMoveIn(id);
    }

    function test_onlyLandlordMarksHandover() public {
        uint256 id = _deposit();
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(RentFlowEscrow.NotLandlord.selector, stranger));
        escrow.markHandover(id);
    }

    function test_tenantCanDisputeAfterHandover() public {
        uint256 id = _deposit();

        vm.prank(tenant);
        vm.expectRevert(abi.encodeWithSelector(RentFlowEscrow.InvalidEscrowState.selector, id));
        escrow.dispute(id);

        vm.prank(landlord);
        escrow.markHandover(id);
        vm.prank(tenant);
        escrow.dispute(id);
        assertEq(uint8(_status(id)), uint8(RentFlowEscrow.EscrowStatus.Disputed));

        vm.warp(block.timestamp + escrow.MOVE_IN_WINDOW());
        vm.prank(landlord);
        vm.expectRevert(abi.encodeWithSelector(RentFlowEscrow.EscrowNotPending.selector, id));
        escrow.claimMoveIn(id);
    }

    function test_cancelExpiredStillWorksWithoutHandover() public {
        uint256 id = _deposit();
        vm.warp(block.timestamp + escrow.DISPUTE_TIMEOUT());
        vm.prank(tenant);
        escrow.cancelExpired(id);
        assertEq(escrow.pendingWithdrawals(tenant), RENT + DEPOSIT);
    }

    // ── exploit 3: dispute timeout handed 100% to the tenant ────────────────

    function test_disputeTimeoutSplitsEvenly() public {
        uint256 id = _active();
        vm.prank(tenant);
        escrow.dispute(id);

        vm.warp(block.timestamp + escrow.DISPUTE_TIMEOUT());
        vm.prank(tenant);
        escrow.claimDisputeTimeout(id);

        assertEq(escrow.pendingWithdrawals(tenant), DEPOSIT / 2);
        assertEq(escrow.pendingWithdrawals(landlord), RENT + DEPOSIT / 2);
    }

    function test_arbiterResolvesDispute() public {
        uint256 id = _active();
        vm.prank(landlord);
        escrow.dispute(id);

        vm.prank(arbiter);
        escrow.resolveDispute(id, 75);

        assertEq(escrow.pendingWithdrawals(landlord), RENT + (DEPOSIT * 75) / 100);
        assertEq(escrow.pendingWithdrawals(tenant), DEPOSIT - (DEPOSIT * 75) / 100);
        assertEq(uint8(_status(id)), uint8(RentFlowEscrow.EscrowStatus.Released));
    }

    function test_onlyArbiterResolves() public {
        uint256 id = _active();
        vm.prank(tenant);
        escrow.dispute(id);

        vm.prank(tenant);
        vm.expectRevert(abi.encodeWithSelector(RentFlowEscrow.NotArbiter.selector, tenant));
        escrow.resolveDispute(id, 0);
    }

    function test_mutualSettlement() public {
        uint256 id = _active();
        vm.prank(tenant);
        escrow.dispute(id);

        vm.prank(landlord);
        escrow.proposeSettlement(id, 40);
        vm.prank(tenant);
        escrow.proposeSettlement(id, 40);

        assertEq(escrow.pendingWithdrawals(landlord), RENT + (DEPOSIT * 40) / 100);
        assertEq(escrow.pendingWithdrawals(tenant), DEPOSIT - (DEPOSIT * 40) / 100);
    }

    function test_listingReusableAfterTenancy() public {
        uint256 id = _active();
        vm.prank(tenant);
        escrow.endTenancy(id);
        vm.prank(landlord);
        escrow.approveDepositReturn(id);

        vm.prank(tenant);
        uint256 next = escrow.depositRent(1);
        assertEq(next, id + 1);
    }

    function test_fundsConserved() public {
        uint256 id = _active();
        vm.prank(tenant);
        escrow.endTenancy(id);
        vm.prank(landlord);
        escrow.dispute(id);
        vm.prank(arbiter);
        escrow.resolveDispute(id, 33);

        assertEq(
            escrow.pendingWithdrawals(landlord) + escrow.pendingWithdrawals(tenant),
            usdc.balanceOf(address(escrow))
        );
    }
}
