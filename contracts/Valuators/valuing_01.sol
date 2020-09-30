pragma solidity >=0.4.23 <0.8.0;
// SPDX-License-Identifier: MIT

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";


interface unboundInterface {
    function _mint(address account, uint256 amount, uint256 fee, address LLCAddr) external;
    function _burn(address account, uint256 toBurn, address LLCAddr) external;
    function checkLoan(address user, address lockLocation) external view returns (uint256 owed);
    function balanceOf(address account) external view returns (uint256); 
}

// ---------------------------------------------------------------------------------------
//                                   Unbound Valuing Contract
//         
//                                     By: Unbound Finance
// ---------------------------------------------------------------------------------------
// This contract contains the logic of applying the LTV rate to the stablecoin value of 
// the provided liquidity. The fee to be deducted from the user is also stored here, and 
// passed to the UND mint function.
// 
// Each LLC must be registered with this contract, and assigned fee and LTV rates. The user
// can only call this function via the LLC.
// ----------------------------------------------------------------------------------------

contract Valuing_01 {
    using SafeMath for uint256;
    using Address for address;

    //Owner Address
    address _owner;

     // Liquidity Lock Contract structs - contains fee and loan rate
    struct LiquidityLock {
        uint256 feeRate; // this will contain the number by which the raw loan value is divided by to obtain desired %
        uint256 loanRate; // i.e. for 50%, this value would be 2, because 100.div(2) will return 50% of the original number

        bool active; // bool that indicates if address is allowed for use.
    }

    // mapping of Approved LLC Contract structs
    mapping (address => LiquidityLock) listOfLLC;

    // mapping of Approved unbound token address
    mapping (address => bool) isUnbound;

    // Modifiers
    modifier onlyOwner() {
        require(isOwner(), "Ownable: caller is not the owner");
        _;
    }

    // Constructor
    constructor (address UND) public {
        isUnbound[UND] = true;
        _owner = msg.sender;
    }

    // Token Creation Function - only called from LLC
    //
    // receives the total value (in stablecoin) of the locked liquidity from LLC,
    // calculates loan amount in UND using loanRate variable from struct
    function unboundCreate(uint256 amount, address user, address token) external {
        require (listOfLLC[msg.sender].active, "LLC not authorized");
        require (isUnbound[token], "invalid unbound contract");
        
        
        unboundInterface unboundContract = unboundInterface(token);

        // computes loan amount
        uint256 loanAmt = amount.div(listOfLLC[msg.sender].loanRate); // Currently, this method will be difficult to accomodate certain % numbers like 50.5% for example

        // calls mint 
        unboundContract._mint(user, loanAmt, listOfLLC[msg.sender].feeRate, msg.sender);

    }

    // Loan repayment Intermediary - only called from LLC
    function unboundRemove(uint256 toUnlock, uint256 totalLocked, address user, address token) external {
        require (listOfLLC[msg.sender].active, "LLC not authorized");
        require (isUnbound[token], "invalid unbound contract");

        // obtains amount of loan user owes (in UND)
        unboundInterface unboundContract = unboundInterface(token);
        uint256 userLoaned = unboundContract.checkLoan(user, msg.sender);

        // compute amount of UND necessary to unlock LPT
        uint256 toPayInUDai = userLoaned.mul(toUnlock).div(totalLocked);
        
        // calls burn
        unboundContract._burn(user, toPayInUDai, msg.sender);
        
    }

    // returns the fee and loanrate variables attached to an LLC
    function getLLCStruct(address LLC) public view returns (uint256 fee, uint256 loanrate) {
        fee = listOfLLC[LLC].feeRate;
        loanrate = listOfLLC[LLC].loanRate;
    }

    // onlyOwner Functions

    // grant permission for an unbound token to be called
    function allowToken (address uToken) public onlyOwner {
        isUnbound[uToken] = true;
    }

    // grants an LLC permission //
    function addLLC (address LLC, uint256 loan, uint256 fee) public onlyOwner {

        // To prevent division by zero
        require(loan != 0, "Valuing: cannot accept 0");
        require(fee != 0, "Valuing: cannot accept 0");

        // Assign variables
        listOfLLC[LLC].feeRate = fee;
        listOfLLC[LLC].loanRate = loan;
        listOfLLC[LLC].active = true;
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

}