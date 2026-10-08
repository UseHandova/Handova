// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title RentSavingsVault
/// @notice Tenants put USDC aside for their next rent. The money is theirs: only the saver can move it, and they
///         can withdraw at any time. There is no owner and no admin function — Handova cannot touch savings.
/// @dev    No yield: the vault holds plain USDC. A future version may route savings into a yield source once a
///         licensed, allowed one exists; this contract will never be upgraded in place.
contract RentSavingsVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;

    struct Goal {
        uint128 target; // USDC (6 decimals) to have saved by `dueAt`
        uint64 dueAt;   // unix seconds, usually when the next rent is due
    }

    mapping(address => uint256) public balanceOf;
    mapping(address => Goal) public goals;
    uint256 public totalSaved;

    event Saved(address indexed saver, uint256 amount, uint256 balance);
    event Withdrawn(address indexed saver, address indexed to, uint256 amount, uint256 balance);
    event GoalSet(address indexed saver, uint256 target, uint64 dueAt);

    error ZeroAmount();
    error ZeroAddress();
    error InsufficientSavings(uint256 balance, uint256 requested);
    error BadGoal();

    constructor(address usdc_) {
        if (usdc_ == address(0)) revert ZeroAddress();
        usdc = IERC20(usdc_);
    }

    /// @notice Put `amount` USDC aside. Approve the vault for `amount` first (or batch both in one user operation).
    function deposit(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        balanceOf[msg.sender] += amount;
        totalSaved += amount;
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit Saved(msg.sender, amount, balanceOf[msg.sender]);
    }

    /// @notice Take savings out — to your own wallet, or straight to wherever the rent is paid.
    function withdraw(uint256 amount, address to) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (to == address(0)) revert ZeroAddress();
        uint256 bal = balanceOf[msg.sender];
        if (amount > bal) revert InsufficientSavings(bal, amount);
        balanceOf[msg.sender] = bal - amount;
        totalSaved -= amount;
        usdc.safeTransfer(to, amount);
        emit Withdrawn(msg.sender, to, amount, bal - amount);
    }

    /// @notice Record what you're saving for (shown in the app; doesn't lock anything).
    function setGoal(uint128 target, uint64 dueAt) external {
        if (target == 0 || dueAt <= block.timestamp) revert BadGoal();
        goals[msg.sender] = Goal(target, dueAt);
        emit GoalSet(msg.sender, target, dueAt);
    }
}
