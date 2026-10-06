// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";

contract RentFlowNFT is ERC721, ERC721URIStorage, Ownable {
    address public immutable escrowContract;

    uint256 public tokenCounter;
    mapping(uint256 => uint256) public escrowToTokenId;

    error ZeroAddress();
    error UnauthorizedCaller(address caller);
    error AlreadyMinted(uint256 escrowId);
    error EmptyTokenUri();

    event LeaseMinted(uint256 indexed escrowId, uint256 indexed tokenId, address indexed tenant, string tokenUri);

    constructor(address escrowContract_) ERC721("RentFlow Lease Certificate", "RFLEASE") Ownable(msg.sender) {
        if (escrowContract_ == address(0)) revert ZeroAddress();
        escrowContract = escrowContract_;
    }

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
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
