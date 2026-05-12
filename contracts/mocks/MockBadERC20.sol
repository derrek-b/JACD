// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

contract MockBadERC20 {
    string public name = 'Mock Bad USDC';
    string public symbol = 'mUSDC';
    uint8 public decimals = 6;
    uint256 public totalSupply;

    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) public allowance;

    mapping(address => uint256) public spoofedBalance;
    mapping(address => bool)    public balanceSpoofed;

    bool public failTransfer;
    bool public failTransferFrom;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function setFailTransfer(bool _v) external { failTransfer = _v; }
    function setFailTransferFrom(bool _v) external { failTransferFrom = _v; }

    function setSpoofedBalance(address _a, uint256 _v) external {
        spoofedBalance[_a] = _v;
        balanceSpoofed[_a] = true;
    }
    function clearSpoof(address _a) external { balanceSpoofed[_a] = false; }

    function balanceOf(address _a) public view returns (uint256) {
        if (balanceSpoofed[_a]) return spoofedBalance[_a];
        return _balances[_a];
    }

    function mint(address _to, uint256 _amount) external {
        _balances[_to] += _amount;
        totalSupply += _amount;
    }

    function approve(address _spender, uint256 _value) external returns (bool) {
        allowance[msg.sender][_spender] = _value;
        emit Approval(msg.sender, _spender, _value);
        return true;
    }

    function transfer(address _to, uint256 _value) external returns (bool) {
        if (failTransfer) return false;

        _balances[msg.sender] -= _value;
        _balances[_to] += _value;
        emit Transfer(msg.sender, _to, _value);
        return true;
    }

    function transferFrom(address _from, address _to, uint256 _value) external returns (bool) {
        if (failTransferFrom) return false;

        allowance[_from][msg.sender] -= _value;
        _balances[_from] -= _value;
        _balances[_to] += _value;
        emit Transfer(_from, _to, _value);
        return true;
    }
}
