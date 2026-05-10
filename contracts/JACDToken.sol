//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import '@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol';
import '@openzeppelin/contracts/access/Ownable.sol';

contract JACDToken is ERC20Burnable, Ownable {
    string public constant VERSION = "1.0.0";

    constructor(string memory _name, string memory _symbol) ERC20(_name, _symbol) {
    }

    function mint(address account, uint256 _amount) public virtual onlyOwner returns (bool) {
        _mint(account, _amount);

        return true;
    }
}
