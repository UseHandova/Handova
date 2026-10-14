// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IRentFlowNFT {
    function mintLeaseCertificate(uint256 escrowId, address tenant, string calldata tokenUri) external returns (uint256 tokenId);
}

/// @notice Upgradeable (UUPS): deployed behind an ERC1967 proxy, so the address and all listings, escrows and balances
///         stay the same when the code is improved. Only the owner can upgrade. Storage rule for future versions:
///         never reorder or remove state variables — only append new ones.
contract RentFlowEscrow is Initializable, OwnableUpgradeable, ReentrancyGuardUpgradeable, UUPSUpgradeable {
    using SafeERC20 for IERC20;

    enum EscrowStatus {
        Pending,
        Active,
        Released,
        Refunded,
        Disputed,
        Ending
    }

    struct Listing {
        address landlord;
        uint256 rentAmountUsdc;
        uint256 depositAmountUsdc;
        bool active;
        string metadataUri;
    }

    struct Escrow {
        uint256 listingId;
        address tenant;
        uint256 totalHeld;
        EscrowStatus status;
        uint256 createdAt;
    }

    struct DisputeProposal {
        uint8 landlordShareBps;
        bool landlordSigned;
        bool tenantSigned;
        uint256 proposedAt;
    }

    IERC20 public usdcToken;
    IRentFlowNFT public nftContract;
    bool private nftContractLocked;

    uint256 public listingCounter;
    uint256 public escrowCounter;
    uint256 public constant DISPUTE_TIMEOUT = 7 days;
    uint256 public constant MOVE_IN_WINDOW = 3 days;
    uint256 public constant DEPOSIT_REVIEW_PERIOD = 7 days;

    /// @notice Neutral party (the RentFlow team) that can resolve disputes from submitted evidence.
    address public arbiter;

    /// @notice Backend key allowed to record landlord identity verification (after a KYC match).
    address public verifier;
    /// @notice When a landlord's identity was verified (0 = not verified). Public so every tenant can see it.
    mapping(address => uint256) public verifiedAt;

    mapping(uint256 => Listing) public listings;
    mapping(uint256 => Escrow) public escrows;
    mapping(uint256 => uint256) public listingToEscrowId;
    mapping(address => uint256) public pendingWithdrawals;
    mapping(uint256 => DisputeProposal) public disputeProposals;
    mapping(uint256 => uint256) public disputedAt;
    /// @notice When the landlord marked keys as handed over for a pending escrow (0 = not yet).
    mapping(uint256 => uint256) public handoverAt;
    /// @notice When the tenant asked to end the tenancy and started the deposit review (0 = not yet).
    mapping(uint256 => uint256) public endRequestedAt;
    /// @notice When the tenant moved in (escrow became Active) — the tenancy year, and so the next rent, counts from here.
    mapping(uint256 => uint256) public movedInAt;


    error ZeroAddress();
    error InvalidAmount();
    error EmptyMetadataUri();
    error ListingDoesNotExist(uint256 listingId);
    error EscrowDoesNotExist(uint256 escrowId);
    error ListingNotActive(uint256 listingId);
    error ExistingEscrowOnListing(uint256 listingId);
    error NotLandlord(address caller);
    error NotTenant(address caller);
    error EscrowNotPending(uint256 escrowId);
    error EscrowNotActive(uint256 escrowId);
    error EscrowNotClaimable(uint256 escrowId);
    error InvalidEscrowParty(address caller);
    error InvalidEscrowState(uint256 escrowId);
    error NftContractNotSet();
    error InsufficientDepositReceived(uint256 expectedMinimum, uint256 actualReceived);
    error InvalidLandlordShareBps(uint8 landlordShareBps);
    error DisputeTimeoutNotReached(uint256 escrowId);
    error NotArbiter(address caller);
    error HandoverAlreadyMarked(uint256 escrowId);
    error HandoverNotMarked(uint256 escrowId);
    error MoveInWindowOpen(uint256 escrowId);
    error DepositReviewOpen(uint256 escrowId);
    error NotVerifier(address caller);

    event ListingCreated(
        uint256 indexed listingId,
        address indexed landlord,
        uint256 rentAmountUsdc,
        uint256 depositAmountUsdc,
        string metadataUri
    );
    event ListingDeactivated(uint256 indexed listingId, address indexed landlord);
    event RentDeposited(uint256 indexed escrowId, uint256 indexed listingId, address indexed tenant, uint256 totalHeld);
    event MoveInConfirmed(
        uint256 indexed escrowId,
        address indexed tenant,
        address indexed landlord,
        uint256 rentReleased,
        uint256 depositHeld
    );
    event TenancyEnded(uint256 indexed escrowId, address indexed tenant, uint256 depositRefunded);
    event RentClaimed(uint256 indexed escrowId, address indexed landlord, uint256 amountClaimed);
    event Disputed(uint256 indexed escrowId, address indexed raisedBy);
    event NftContractSet(address indexed nftContract);
    event EscrowCancelled(uint256 indexed escrowId, address indexed cancelledBy, uint256 amountRefunded);
    event DisputeResolved(uint256 indexed escrowId, uint8 landlordShareBps, uint256 landlordAmount, uint256 tenantAmount);
    event DisputeProposed(uint256 indexed escrowId, address proposer, uint8 landlordShareBps);
    event Withdrawn(address indexed recipient, uint256 amount);
    event ArbiterSet(address indexed arbiter);
    event HandoverMarked(uint256 indexed escrowId, address indexed landlord);
    event TenancyEndRequested(uint256 indexed escrowId, address indexed tenant, uint256 depositUnderReview);
    event VerifierSet(address indexed verifier);
    event LandlordVerificationChanged(address indexed landlord, bool verified);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice Runs once, through the proxy, at deployment.
    function initialize(address usdcToken_, address owner_) external initializer {
        if (usdcToken_ == address(0) || owner_ == address(0)) revert ZeroAddress();
        __Ownable_init(owner_);
        __ReentrancyGuard_init();
        usdcToken = IERC20(usdcToken_);
        arbiter = owner_;
        verifier = owner_;
    }

    /// @notice Version of the code behind the proxy (bumped on each upgrade).
    function version() external pure virtual returns (string memory) {
        return "1.0.0";
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    function setVerifier(address verifier_) external onlyOwner {
        if (verifier_ == address(0)) revert ZeroAddress();
        verifier = verifier_;
        emit VerifierSet(verifier_);
    }

    /// @notice Record (or revoke) a landlord's identity verification. Only the verifier can call this;
    /// no personal data goes onchain — just the address and a timestamp.
    function setVerified(address landlord, bool verified) external {
        if (msg.sender != verifier) revert NotVerifier(msg.sender);
        if (landlord == address(0)) revert ZeroAddress();
        verifiedAt[landlord] = verified ? block.timestamp : 0;
        emit LandlordVerificationChanged(landlord, verified);
    }

    function setArbiter(address arbiter_) external onlyOwner {
        if (arbiter_ == address(0)) revert ZeroAddress();
        arbiter = arbiter_;
        emit ArbiterSet(arbiter_);
    }

    function setNftContract(address _nftContract) external onlyOwner {
        require(!nftContractLocked, "NFT contract already set");
        require(_nftContract.code.length > 0, "Not a contract");
        nftContract = IRentFlowNFT(_nftContract);
        nftContractLocked = true;
        emit NftContractSet(_nftContract);
    }

    function createListing(
        uint256 rentAmountUsdc,
        uint256 depositAmountUsdc,
        string calldata metadataUri
    ) external returns (uint256 listingId) {
        if (rentAmountUsdc == 0) revert InvalidAmount();
        if (bytes(metadataUri).length == 0) revert EmptyMetadataUri();

        listingId = ++listingCounter;
        listings[listingId] = Listing({
            landlord: msg.sender,
            rentAmountUsdc: rentAmountUsdc,
            depositAmountUsdc: depositAmountUsdc,
            active: true,
            metadataUri: metadataUri
        });

        emit ListingCreated(listingId, msg.sender, rentAmountUsdc, depositAmountUsdc, metadataUri);
    }

    function deactivateListing(uint256 listingId) external {
        Listing storage listing = listings[listingId];
        if (listing.landlord == address(0)) revert ListingDoesNotExist(listingId);
        if (listing.landlord != msg.sender) revert NotLandlord(msg.sender);
        if (!listing.active) revert ListingNotActive(listingId);
        if (listingToEscrowId[listingId] != 0) revert ExistingEscrowOnListing(listingId);

        listing.active = false;
        emit ListingDeactivated(listingId, msg.sender);
    }

    function depositRent(uint256 listingId) external nonReentrant returns (uint256 escrowId) {
        Listing storage listing = listings[listingId];
        if (listing.landlord == address(0)) revert ListingDoesNotExist(listingId);
        if (!listing.active) revert ListingNotActive(listingId);
        if (listingToEscrowId[listingId] != 0) revert ExistingEscrowOnListing(listingId);

        uint256 total = listing.rentAmountUsdc + listing.depositAmountUsdc;
        if (total == 0) revert InvalidAmount();

        uint256 balanceBefore = usdcToken.balanceOf(address(this));
        usdcToken.safeTransferFrom(msg.sender, address(this), total);
        uint256 balanceAfter = usdcToken.balanceOf(address(this));
        uint256 actualReceived = balanceAfter - balanceBefore;

        uint256 minimumExpected = total - 1;
        if (actualReceived < minimumExpected) {
            revert InsufficientDepositReceived(minimumExpected, actualReceived);
        }

        escrowId = ++escrowCounter;
        escrows[escrowId] = Escrow({
            listingId: listingId,
            tenant: msg.sender,
            totalHeld: actualReceived,
            status: EscrowStatus.Pending,
            createdAt: block.timestamp
        });

        listingToEscrowId[listingId] = escrowId;

        emit RentDeposited(escrowId, listingId, msg.sender, actualReceived);
    }

    function confirmMoveIn(uint256 escrowId) external nonReentrant {
        Escrow storage escrow = escrows[escrowId];
        if (escrow.tenant == address(0)) revert EscrowDoesNotExist(escrowId);
        if (escrow.tenant != msg.sender) revert NotTenant(msg.sender);
        if (escrow.status != EscrowStatus.Pending) revert EscrowNotPending(escrowId);

        _activate(escrowId);
    }

    /// @notice Landlord marks that keys were handed over. From here the tenant has MOVE_IN_WINDOW
    /// to confirm or dispute; after that the landlord can finalise the move-in themselves.
    function markHandover(uint256 escrowId) external {
        Escrow storage escrow = escrows[escrowId];
        if (escrow.tenant == address(0)) revert EscrowDoesNotExist(escrowId);
        if (listings[escrow.listingId].landlord != msg.sender) revert NotLandlord(msg.sender);
        if (escrow.status != EscrowStatus.Pending) revert EscrowNotPending(escrowId);
        if (handoverAt[escrowId] != 0) revert HandoverAlreadyMarked(escrowId);

        handoverAt[escrowId] = block.timestamp;
        emit HandoverMarked(escrowId, msg.sender);
    }

    /// @notice Landlord finalises the move-in when the tenant stays silent after handover.
    function claimMoveIn(uint256 escrowId) external nonReentrant {
        Escrow storage escrow = escrows[escrowId];
        if (escrow.tenant == address(0)) revert EscrowDoesNotExist(escrowId);
        if (listings[escrow.listingId].landlord != msg.sender) revert NotLandlord(msg.sender);
        if (escrow.status != EscrowStatus.Pending) revert EscrowNotPending(escrowId);
        if (handoverAt[escrowId] == 0) revert HandoverNotMarked(escrowId);
        if (block.timestamp < handoverAt[escrowId] + MOVE_IN_WINDOW) revert MoveInWindowOpen(escrowId);

        _activate(escrowId);
    }

    /// @notice Tenant moves out. The deposit is not refunded instantly: the landlord gets
    /// DEPOSIT_REVIEW_PERIOD to approve the refund or dispute it for damages.
    function endTenancy(uint256 escrowId) external nonReentrant {
        Escrow storage escrow = escrows[escrowId];
        if (escrow.tenant == address(0)) revert EscrowDoesNotExist(escrowId);
        if (escrow.tenant != msg.sender) revert NotTenant(msg.sender);
        if (escrow.status != EscrowStatus.Active) revert EscrowNotActive(escrowId);

        if (escrow.totalHeld == 0) {
            _refundTenant(escrowId);
            emit TenancyEnded(escrowId, escrow.tenant, 0);
            return;
        }

        escrow.status = EscrowStatus.Ending;
        endRequestedAt[escrowId] = block.timestamp;

        emit TenancyEndRequested(escrowId, msg.sender, escrow.totalHeld);
    }

    /// @notice Landlord approves the full deposit refund after inspecting the property.
    function approveDepositReturn(uint256 escrowId) external nonReentrant {
        Escrow storage escrow = escrows[escrowId];
        if (escrow.tenant == address(0)) revert EscrowDoesNotExist(escrowId);
        if (listings[escrow.listingId].landlord != msg.sender) revert NotLandlord(msg.sender);
        if (escrow.status != EscrowStatus.Ending) revert InvalidEscrowState(escrowId);

        uint256 refundAmount = _refundTenant(escrowId);
        emit TenancyEnded(escrowId, escrow.tenant, refundAmount);
    }

    /// @notice Tenant reclaims the deposit once the review period passes without a landlord dispute.
    function claimDeposit(uint256 escrowId) external nonReentrant {
        Escrow storage escrow = escrows[escrowId];
        if (escrow.tenant == address(0)) revert EscrowDoesNotExist(escrowId);
        if (escrow.tenant != msg.sender) revert NotTenant(msg.sender);
        if (escrow.status != EscrowStatus.Ending) revert InvalidEscrowState(escrowId);
        if (block.timestamp < endRequestedAt[escrowId] + DEPOSIT_REVIEW_PERIOD) revert DepositReviewOpen(escrowId);

        uint256 refundAmount = _refundTenant(escrowId);
        emit TenancyEnded(escrowId, escrow.tenant, refundAmount);
    }

    function cancelExpired(uint256 escrowId) external nonReentrant {
        Escrow storage escrow = escrows[escrowId];
        if (escrow.tenant == address(0)) revert EscrowDoesNotExist(escrowId);
        if (escrow.status != EscrowStatus.Pending) revert EscrowNotPending(escrowId);
        if (block.timestamp < escrow.createdAt + DISPUTE_TIMEOUT) revert EscrowNotClaimable(escrowId);
        // Once keys are handed over the tenant may be living there, so the rent can no longer be pulled back.
        if (handoverAt[escrowId] != 0) revert EscrowNotClaimable(escrowId);

        Listing storage listing = listings[escrow.listingId];
        if (msg.sender != escrow.tenant && msg.sender != listing.landlord) {
            revert InvalidEscrowParty(msg.sender);
        }

        uint256 amountRefunded = escrow.totalHeld;
        escrow.totalHeld = 0;
        escrow.status = EscrowStatus.Refunded;
        listingToEscrowId[escrow.listingId] = 0;

        pendingWithdrawals[escrow.tenant] += amountRefunded;

        emit EscrowCancelled(escrowId, msg.sender, amountRefunded);
    }

    function dispute(uint256 escrowId) external {
        Escrow storage escrow = escrows[escrowId];
        if (escrow.tenant == address(0)) revert EscrowDoesNotExist(escrowId);

        Listing storage listing = listings[escrow.listingId];
        if (msg.sender != escrow.tenant && msg.sender != listing.landlord) {
            revert InvalidEscrowParty(msg.sender);
        }
        bool disputable = escrow.status == EscrowStatus.Active
            || escrow.status == EscrowStatus.Ending
            || (escrow.status == EscrowStatus.Pending && handoverAt[escrowId] != 0);
        if (!disputable) revert InvalidEscrowState(escrowId);

        escrow.status = EscrowStatus.Disputed;
        disputedAt[escrowId] = block.timestamp;

        emit Disputed(escrowId, msg.sender);
    }

    function proposeSettlement(uint256 escrowId, uint8 landlordShareBps) external {
        if (landlordShareBps > 100) revert InvalidLandlordShareBps(landlordShareBps);

        Escrow storage escrow = escrows[escrowId];
        if (escrow.tenant == address(0)) revert EscrowDoesNotExist(escrowId);
        if (escrow.status != EscrowStatus.Disputed) revert InvalidEscrowState(escrowId);

        Listing storage listing = listings[escrow.listingId];

        bool isLandlord = msg.sender == listing.landlord;
        bool isTenant = msg.sender == escrow.tenant;

        if (!isLandlord && !isTenant) revert InvalidEscrowParty(msg.sender);

        DisputeProposal storage proposal = disputeProposals[escrowId];

        if (proposal.landlordShareBps != landlordShareBps) {
            proposal.landlordShareBps = landlordShareBps;
            proposal.landlordSigned = false;
            proposal.tenantSigned = false;
        }

        if (isLandlord) {
            proposal.landlordSigned = true;
        } else {
            proposal.tenantSigned = true;
        }

        proposal.proposedAt = block.timestamp;

        emit DisputeProposed(escrowId, msg.sender, landlordShareBps);

        if (proposal.landlordSigned && proposal.tenantSigned) {
            _executeSettlement(escrowId, landlordShareBps);
        }
    }

    /// @notice Arbiter settles a dispute after reviewing evidence from both sides.
    function resolveDispute(uint256 escrowId, uint8 landlordShareBps) external nonReentrant {
        if (msg.sender != arbiter) revert NotArbiter(msg.sender);
        if (landlordShareBps > 100) revert InvalidLandlordShareBps(landlordShareBps);

        Escrow storage escrow = escrows[escrowId];
        if (escrow.tenant == address(0)) revert EscrowDoesNotExist(escrowId);
        if (escrow.status != EscrowStatus.Disputed) revert InvalidEscrowState(escrowId);

        _executeSettlement(escrowId, landlordShareBps);
    }

    /// @notice If neither the parties nor the arbiter settle in time, split 50/50 so that
    /// neither side can win by stalling.
    function claimDisputeTimeout(uint256 escrowId) external nonReentrant {
        Escrow storage escrow = escrows[escrowId];
        if (escrow.tenant == address(0)) revert EscrowDoesNotExist(escrowId);
        require(msg.sender == escrow.tenant || msg.sender == listings[escrow.listingId].landlord, "Only tenant or landlord");
        if (escrow.status != EscrowStatus.Disputed) revert InvalidEscrowState(escrowId);
        if (block.timestamp < disputedAt[escrowId] + DISPUTE_TIMEOUT) revert DisputeTimeoutNotReached(escrowId);

        _executeSettlement(escrowId, 50);
    }

    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        require(amount > 0, "nothing to withdraw");

        pendingWithdrawals[msg.sender] = 0;
        usdcToken.safeTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, amount);
    }

    function _activate(uint256 escrowId) internal {
        if (address(nftContract) == address(0)) revert NftContractNotSet();

        Escrow storage escrow = escrows[escrowId];
        Listing storage listing = listings[escrow.listingId];
        uint256 rentAmountUsdc = listing.rentAmountUsdc;

        escrow.status = EscrowStatus.Active;
        escrow.totalHeld -= rentAmountUsdc;
        pendingWithdrawals[listing.landlord] += rentAmountUsdc;
        delete handoverAt[escrowId];
        movedInAt[escrowId] = block.timestamp;

        nftContract.mintLeaseCertificate(escrowId, escrow.tenant, listing.metadataUri);

        emit MoveInConfirmed(escrowId, escrow.tenant, listing.landlord, rentAmountUsdc, escrow.totalHeld);
    }

    function _refundTenant(uint256 escrowId) internal returns (uint256 refundAmount) {
        Escrow storage escrow = escrows[escrowId];
        refundAmount = escrow.totalHeld;
        escrow.totalHeld = 0;
        escrow.status = EscrowStatus.Refunded;
        listingToEscrowId[escrow.listingId] = 0;
        delete endRequestedAt[escrowId];

        pendingWithdrawals[escrow.tenant] += refundAmount;
    }

    function _executeSettlement(uint256 escrowId, uint8 landlordShareBps) internal {
        Escrow storage escrow = escrows[escrowId];
        Listing storage listing = listings[escrow.listingId];

        uint256 amount = escrow.totalHeld;
        uint256 landlordAmount = (amount * landlordShareBps) / 100;
        uint256 tenantAmount = amount - landlordAmount;

        escrow.totalHeld = 0;
        listingToEscrowId[escrow.listingId] = 0;

        if (landlordAmount == 0) {
            escrow.status = EscrowStatus.Refunded;
        } else {
            escrow.status = EscrowStatus.Released;
        }

        if (landlordAmount > 0) {
            pendingWithdrawals[listing.landlord] += landlordAmount;
        }
        if (tenantAmount > 0) {
            pendingWithdrawals[escrow.tenant] += tenantAmount;
        }

        delete disputeProposals[escrowId];
        delete disputedAt[escrowId];
        delete handoverAt[escrowId];
        delete endRequestedAt[escrowId];

        emit DisputeResolved(escrowId, landlordShareBps, landlordAmount, tenantAmount);
    }
}
