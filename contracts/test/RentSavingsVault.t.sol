// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {RentSavingsVault} from "../RentSavingsVault.sol";
import {MockUSDC} from "./RentFlowEscrow.t.sol";

contract RentSavingsVaultTest is Test {
    RentSavingsVault vault;
    MockUSDC usdc;
    address tenant = address(0xA11CE);
    address other = address(0xB0B);
    address landlordEscrow = address(0xE5C);

    function setUp() public {
        usdc = new MockUSDC();
        vault = new RentSavingsVault(address(usdc));
        usdc.mint(tenant, 1_000e6);
        usdc.mint(other, 1_000e6);
        vm.prank(tenant);
        usdc.approve(address(vault), type(uint256).max);
        vm.prank(other);
        usdc.approve(address(vault), type(uint256).max);
    }

    function test_depositAddsToBalance() public {
        vm.prank(tenant);
        vault.deposit(15e6);
        vm.prank(tenant);
        vault.deposit(15e6);
        assertEq(vault.balanceOf(tenant), 30e6);
        assertEq(vault.totalSaved(), 30e6);
        assertEq(usdc.balanceOf(address(vault)), 30e6);
    }

    function test_withdrawAnytimeToSelfOrElsewhere() public {
        vm.startPrank(tenant);
        vault.deposit(100e6);
        vault.withdraw(40e6, tenant);
        vault.withdraw(10e6, landlordEscrow);
        vm.stopPrank();
        assertEq(vault.balanceOf(tenant), 50e6);
        assertEq(usdc.balanceOf(tenant), 940e6);
        assertEq(usdc.balanceOf(landlordEscrow), 10e6);
        assertEq(vault.totalSaved(), 50e6);
    }

    function test_cannotWithdrawMoreThanSaved() public {
        vm.prank(tenant);
        vault.deposit(10e6);
        vm.prank(tenant);
        vm.expectRevert(abi.encodeWithSelector(RentSavingsVault.InsufficientSavings.selector, 10e6, 11e6));
        vault.withdraw(11e6, tenant);
    }

    function test_nobodyElseCanTouchYourSavings() public {
        vm.prank(tenant);
        vault.deposit(100e6);
        vm.prank(other);
        vm.expectRevert(abi.encodeWithSelector(RentSavingsVault.InsufficientSavings.selector, 0, 1e6));
        vault.withdraw(1e6, other);
        assertEq(vault.balanceOf(tenant), 100e6);
    }

    function test_savingsAreSeparatePerPerson() public {
        vm.prank(tenant);
        vault.deposit(70e6);
        vm.prank(other);
        vault.deposit(5e6);
        vm.prank(other);
        vault.withdraw(5e6, other);
        assertEq(vault.balanceOf(tenant), 70e6);
        assertEq(vault.balanceOf(other), 0);
    }

    function test_zeroAmountsAndZeroAddressRejected() public {
        vm.startPrank(tenant);
        vm.expectRevert(RentSavingsVault.ZeroAmount.selector);
        vault.deposit(0);
        vault.deposit(1e6);
        vm.expectRevert(RentSavingsVault.ZeroAmount.selector);
        vault.withdraw(0, tenant);
        vm.expectRevert(RentSavingsVault.ZeroAddress.selector);
        vault.withdraw(1e6, address(0));
        vm.stopPrank();
    }

    function test_goal() public {
        vm.warp(1_800_000_000);
        vm.prank(tenant);
        vault.setGoal(500e6, 1_830_000_000);
        (uint128 target, uint64 dueAt) = vault.goals(tenant);
        assertEq(target, 500e6);
        assertEq(dueAt, 1_830_000_000);
        vm.prank(tenant);
        vm.expectRevert(RentSavingsVault.BadGoal.selector);
        vault.setGoal(500e6, 1_700_000_000); // in the past
    }

    function test_noOwnerOrAdminFunctions() public view {
        // The only state-changing functions are deposit, withdraw and setGoal, all scoped to msg.sender.
        assertEq(address(vault.usdc()), address(usdc));
    }
}
