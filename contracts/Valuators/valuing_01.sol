pragma solidity ^0.6.2;
// SPDX-License-Identifier: MIT

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";


interface unboundInterface {
    function _mint(address account, uint256 amount, uint256 fee, address feeAddr) external;
    function _burn(address account, uint256 toBurn, uint256 fee, address feeAddr) external;
    function checkLoan(address user) external view returns (uint256 owed);
    function balanceOf(address account) external view returns (uint256); 
}

contract Valuing_01 {
    using SafeMath for uint256;
    using Address for address;

    //Owner Address
    address _owner;

    // Fee Owner
    address feeHolder;

     // Liquidity Lock Contract structs - contains fee and loan rate
    struct LiquidityLock {
        uint256 feeRate;
        uint256 loanRate;
        bool active;
    }

    //Approved Contracts
    mapping (address => LiquidityLock) listOfLLC;

    // Approved unbound tokens
    mapping (address => bool) isUnbound;

    //Unbound Token Contracts
    // uEthContract private uEthInterface;

    // DO WE NEED THIS?? 
    //unboundInterface private uDaiContract;

    // Modifiers
    modifier onlyOwner() {
        require(isOwner(), "Ownable: caller is not the owner");
        _;
    }

    // Constructor
    constructor (address feeAddr, address uDai) public {
        isUnbound[uDai] = true;
        _owner = msg.sender;
        feeHolder = feeAddr;
    }

    // Token Creation Functions

    function unboundCreate(uint256 amount, address user, address token) external {
        require (listOfLLC[msg.sender].active, "LLC not authorized");
        require (isUnbound[token], "invalid unbound contract");
        
        unboundInterface unboundContract = unboundInterface(token);
        uint256 loanAmt = amount.div(listOfLLC[msg.sender].loanRate); // Currently, this method will be difficult to accomodate certain % numbers like 50.5% for example
        unboundContract._mint(user, loanAmt, listOfLLC[msg.sender].feeRate, feeHolder);

    }

    function unboundRemove(uint256 toUnlock, uint256 totalLocked, address user, address token) external {
        require (listOfLLC[msg.sender].active, "LLC not authorized");
        require (isUnbound[token], "invalid unbound contract");
        unboundInterface unboundContract = unboundInterface(token);
        uint256 userLoaned = unboundContract.checkLoan(user);
        uint256 toPayInUDai = userLoaned.mul(toUnlock).div(totalLocked);
        // compute amount of uDai necessary to unlock LPT

        

        unboundContract._burn(user, toPayInUDai, listOfLLC[msg.sender].feeRate, feeHolder);
        
    }

    function getLLCStruct(address LLC) public view returns (uint256 fee, uint256 loanrate) {
        fee = listOfLLC[LLC].feeRate;
        loanrate = listOfLLC[LLC].loanRate;
    }

    // onlyOwner Functions

    // grant permission for an unbound token to be called
    function allowToken (address uToken) public onlyOwner {
        isUnbound[uToken] = true;
    }

    // grants an LLC permission
    function addLLC (address LLC, uint256 loan, uint256 fee) public onlyOwner {
        listOfLLC[LLC].feeRate = fee;
        listOfLLC[LLC].loanRate = loan;
        listOfLLC[LLC].active = true;
    }

    // grants LLC permission via constructor of LLC:
    // Intended to work only when LLC is deployed by _owner
    // Potential vulnerability using tx.origin. Please review
    // msg.sender in constructor will be 0x0000... so this will NOT work
    function addLLCauto (uint256 loan, uint256 fee) external {
        require (tx.origin == _owner); 
        listOfLLC[msg.sender].feeRate = fee;
        listOfLLC[msg.sender].loanRate = loan;
        listOfLLC[msg.sender].active = true;
    }
    



    // Disables an LLC:
    function disableLLC (address LLC) public onlyOwner {
        listOfLLC[LLC].feeRate = 0;
        listOfLLC[LLC].loanRate = 0;
        listOfLLC[LLC].active = false;
    }

    // Checks if sender is owner
    function isOwner() public view returns (bool) {
        return msg.sender == _owner;
    }

    // Changes owner
    function setOwner(address _newOwner) public onlyOwner {
        _owner = _newOwner;
    }

    // Changes Fee Address
    function setFeeHolder(address _newFeeAddr) public onlyOwner {
        feeHolder = _newFeeAddr;
    }
}