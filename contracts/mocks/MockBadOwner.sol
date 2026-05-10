// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

interface INFTWithdraw {
    function withdraw() external;
}

contract MockBadOwner {
    function callWithdraw(address _nft) external {
        INFTWithdraw(_nft).withdraw();
    }

    receive() external payable {
        revert('MockBadOwner: rejects ether');
    }
}
