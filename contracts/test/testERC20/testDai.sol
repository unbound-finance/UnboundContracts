pragma solidity >=0.4.23 <0.8.0;
// SPDX-License-Identifier: MIT

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

contract TestDai is IERC20 {
    using SafeMath for uint;

    string public constant name = 'TestDai';
    string public constant symbol = 'TDAI';
    uint8 public constant decimals = 18;
    uint  public override totalSupply;
    string public constant version = "1";  // From DAI contract
    mapping(address => uint) public override balanceOf;
    mapping(address => mapping(address => uint)) public override allowance;

    // PERMIT VARIABLES
    bytes32 public DOMAIN_SEPARATOR;
    // keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");
    bytes32 public constant PERMIT_TYPEHASH = 0x6e71edae12b1b97f4d1f60370fef10105fa2faae0126114a169c64845d6126c9;
    mapping(address => uint) public nonces;


    // event Approval(address indexed owner, address indexed spender, uint value);
    // event Transfer(address indexed from, address indexed to, uint value);

    constructor(address tester, uint256 chainId_) {
        balanceOf[msg.sender] = balanceOf[msg.sender].add(100000000000 * (10 ** 18));
        balanceOf[tester] = balanceOf[tester].add(100000000000 * (10 ** 18));
        totalSupply = totalSupply.add(1000000 * (10 ** 18));

        // Permit??
        DOMAIN_SEPARATOR = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256(bytes(name)),
            keccak256(bytes(version)),
            chainId_,
            address(this)
        ));
    }

    function _mint(address to, uint value) public {
        totalSupply = totalSupply.add(value);
        balanceOf[to] = balanceOf[to].add(value);
        emit Transfer(address(0), to, value);
    }

    function _burn(address from, uint value) public {
        balanceOf[from] = balanceOf[from].sub(value);
        totalSupply = totalSupply.sub(value);
        emit Transfer(from, address(0), value);
    }

    function _approve(address owner, address spender, uint value) private {
        allowance[owner][spender] = value;
        emit Approval(owner, spender, value);
    }

    function _transfer(address from, address to, uint value) private {
        balanceOf[from] = balanceOf[from].sub(value);
        balanceOf[to] = balanceOf[to].add(value);
        emit Transfer(from, to, value);
    }

    function approve(address spender, uint value) external override returns (bool) {
        _approve(msg.sender, spender, value);
        return true;
    }

    function transfer(address to, uint value) external override returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function transferFrom(address from, address to, uint value) external override returns (bool) {
        if (allowance[from][msg.sender] != uint(-1)) {
            allowance[from][msg.sender] = allowance[from][msg.sender].sub(value);
        }
        _transfer(from, to, value);
        return true;
    }

    //  PERMIT FUNCTION - from DAI contract
    function permit(address holder, address spender, uint256 nonce, uint256 expiry,
                    bool allowed, uint8 v, bytes32 r, bytes32 s) external
    {
        bytes32 digest =
            keccak256(abi.encodePacked(
                "\x19\x01",                    // Do not understand what this is for
                DOMAIN_SEPARATOR,              
                keccak256(abi.encode(          // are we just taking a hash of a hash here?
                    PERMIT_TYPEHASH,
                    holder,
                    spender,
                    nonce,
                    expiry,
                    allowed))
        ));

        require(holder != address(0), "invalid-address-0");
        require(holder == ecrecover(digest, v, r, s), "invalid-permit");
        require(expiry == 0 || block.timestamp <= expiry, "permit-expired");
        require(nonce == nonces[holder]++, "invalid-nonce");           // When does nonces[holder] actually change?
        uint wad = allowed ? uint(-1) : 0;
        allowance[holder][spender] = wad;
        emit Approval(holder, spender, wad);
    }
}