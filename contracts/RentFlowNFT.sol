// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {ERC721Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import {ERC721URIStorageUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721URIStorageUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/// @notice Lease certificates, minted by the escrow on move-in. Upgradeable (UUPS) behind an ERC1967 proxy; only the
///         owner can upgrade. Future versions: append state only, never reorder.
contract RentFlowNFT is Initializable, ERC721Upgradeable, ERC721URIStorageUpgradeable, OwnableUpgradeable, UUPSUpgradeable {
    address public escrowContract;

    uint256 public tokenCounter;
    mapping(uint256 => uint256) public escrowToTokenId;

    error ZeroAddress();
    error UnauthorizedCaller(address caller);
    error AlreadyMinted(uint256 escrowId);
    error EmptyTokenUri();

    event LeaseMinted(uint256 indexed escrowId, uint256 indexed tokenId, address indexed tenant, string tokenUri);


    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address escrowContract_, address owner_) external initializer {
        if (escrowContract_ == address(0) || owner_ == address(0)) revert ZeroAddress();
        __ERC721_init("RentFlow Lease Certificate", "RFLEASE");
        __ERC721URIStorage_init();
        __Ownable_init(owner_);
        escrowContract = escrowContract_;
    }

    function version() external pure virtual returns (string memory) {
        return "1.0.0";
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    function mintLeaseCertificate(
        uint256 escrowId,
        address tenant,
        string calldata tokenUri
    ) external returns (uint256 tokenId) {
        if (msg.sender != escrowContract) revert UnauthorizedCaller(msg.sender);
        if (tenant == address(0)) revert ZeroAddress();
        if (escrowToTokenId[escrowId] != 0) revert AlreadyMinted(escrowId);
        if (bytes(tokenUri).length == 0) revert EmptyTokenUri();

        tokenId = ++tokenCounter;
        escrowToTokenId[escrowId] = tokenId;

        _safeMint(tenant, tokenId);
        _setTokenURI(tokenId, tokenUri);

        emit LeaseMinted(escrowId, tokenId, tenant, tokenUri);
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721Upgradeable, ERC721URIStorageUpgradeable)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721Upgradeable, ERC721URIStorageUpgradeable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
