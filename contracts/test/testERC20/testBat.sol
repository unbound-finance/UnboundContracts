pragma solidity >=0.4.23 <0.8.0;
// SPDX-License-Identifier: MIT

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

contract TestBat is IERC20 {
    using SafeMath for uint256;

    string public constant name = "TestBat";
    string public constant symbol = "TBAT";
    uint8 public constant decimals = 18;
    uint256 public override totalSupply;
    mapping(address => uint256) public override balanceOf;
    mapping(address => mapping(address => uint256)) public override allowance;

    // event Approval(address indexed owner, address indexed spender, uint value);
    // event Transfer(address indexed from, address indexed to, uint value);

    constructor(address tester) {
        balanceOf[msg.sender] = balanceOf[msg.sender].add(1000000000000 * (10**18));
        balanceOf[tester] = balanceOf[tester].add(1000000000000 * (10**18));
        totalSupply = totalSupply.add(1000000 * (10**18));
    }

    function _mint(address to, uint256 value) public {
        totalSupply = totalSupply.add(value);
        balanceOf[to] = balanceOf[to].add(value);
        emit Transfer(address(0), to, value);
    }

    function _burn(address from, uint256 value) public {
        balanceOf[from] = balanceOf[from].sub(value);
        totalSupply = totalSupply.sub(value);
        emit Transfer(from, address(0), value);
    }

    function _approve(
        address owner,
        address spender,
        uint256 value
    ) private {
        allowance[owner][spender] = value;
        emit Approval(owner, spender, value);
    }

    function _transfer(
        address from,
        address to,
        uint256 value
    ) private {
        balanceOf[from] = balanceOf[from].sub(value);
        balanceOf[to] = balanceOf[to].add(value);
        emit Transfer(from, to, value);
    }

    function approve(address spender, uint256 value) external override returns (bool) {
        _approve(msg.sender, spender, value);
        return true;
    }

    function transfer(address to, uint256 value) external override returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function transferFrom(
        address from,
        address to,
        uint256 value
    ) external override returns (bool) {
        if (allowance[from][msg.sender] != uint256(-1)) {
            allowance[from][msg.sender] = allowance[from][msg.sender].sub(value);
        }
        _transfer(from, to, value);
        return true;
    }
}
