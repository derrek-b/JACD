// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import '../JACDToken.sol';

contract MockBadJACDToken is JACDToken {
    constructor(string memory _name, string memory _symbol) JACDToken(_name, _symbol) {}

    function mint(address, uint256) public override onlyOwner returns (bool) {
        return false;
    }
}
