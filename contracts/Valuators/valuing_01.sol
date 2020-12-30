// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.7.5;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../Interfaces/IUnboundToken.sol";


// ---------------------------------------------------------------------------------------
//                                   Unbound Valuing Contract
//        
//                                     By: Unbound Finance
// ---------------------------------------------------------------------------------------
// This contract contains the logic of applying the LTV rate to the baseAsset value of 
// the provided liquidity. The fee to be deducted from the user is also stored here, and 
// passed to the uToken mint function.
// 
// Each LLC must be registered with this contract, and assigned fee and LTV rates. The user
// can only call this function via the LLC.
// ----------------------------------------------------------------------------------------

contract Valuing_01 {
    using SafeMath for uint256;
    using Address for address;

    //Owner Address
    address private _owner;

     // Liquidity Lock Contract structs - contains fee and loan rate
    struct LiquidityLock {
        uint32 feeRate; // this will contain the number by obtained by multiplying the rate by 10 ^ 6
        uint32 loanRate; // i.e. for 50%, this value would be 500000, because 100.mul(500000).div(10**6) will return 50% of the original number
        address uToken; // address of uToken to mint for the specific LLC.
        bool active; // bool that indicates if address is allowed for use.
    }

    // mapping of Approved LLC Contract structs
    mapping (address => LiquidityLock) listOfLLC;

    // number of decimals by which to divide fee multiple by.
    uint256 public constant rateBalance = (10 ** 6);

    // Modifiers
    modifier onlyOwner() {
        require(isOwner(), "Ownable: caller is not the owner");
        _;
    }

    // Constructor
    constructor () {
        _owner = msg.sender;
    }

    // Token Creation Function - only called from LLC
    //
    // receives the total value (in uToken) of the locked liquidity from LLC,
    // calculates loan amount in uToken using loanRate variable from struct
    function unboundCreate(uint256 amount, address user, uint256 minTokenAmount) external {
        require (amount > 0, "Cannot valuate nothing");
        require (listOfLLC[msg.sender].active, "LLC not authorized");
        
        IUnboundToken unboundContract = IUnboundToken(listOfLLC[msg.sender].uToken);

        // computes loan amount
        uint256 loanAmt = amount;
        if (listOfLLC[msg.sender].loanRate != 0) {
            loanAmt = amount.mul(listOfLLC[msg.sender].loanRate).div(rateBalance);
            require (loanAmt > 0, "value too small"); 
        } 

        // computes fee amount
        uint256 feeAmt = 0;
        if (listOfLLC[msg.sender].feeRate != 0) {
            require(loanAmt.mul(listOfLLC[msg.sender].feeRate) >= rateBalance, "amount is too small");
            feeAmt = loanAmt.mul(listOfLLC[msg.sender].feeRate).div(rateBalance);
        }

    
        // calls mint 
        unboundContract._mint(user, loanAmt, feeAmt, msg.sender, minTokenAmount);

    }

    // Loan repayment Intermediary - only called from LLC
    function unboundRemove(uint256 toUnlock, address user) external {
        require (listOfLLC[msg.sender].active, "LLC not authorized");

        // obtains amount of loan user owes (in uToken)
        IUnboundToken unboundContract = IUnboundToken(listOfLLC[msg.sender].uToken);
        
        // calls burn
        unboundContract._burn(user, toUnlock, msg.sender);
        
    }

    // returns the fee and loanrate variables attached to an LLC
    function getLLCStruct(address LLC) public view returns (uint32 fee, uint32 loanrate) {
        fee = listOfLLC[LLC].feeRate;
        loanrate = listOfLLC[LLC].loanRate;
    }

    function getUNDLoan(address user) public view returns (uint256 UNDLoan) {
        require(listOfLLC[msg.sender].active, "LLC not authorized");
        UNDLoan = unboundContract.checkLoan(user, msg.sender);
    }

    // onlyOwner Functions

    // grants an LLC permission //
    function addLLC (address LLC, address uToken, uint32 loan, uint32 fee) public onlyOwner {
        // add uToken to mint
        listOfLLC[LLC].uToken = uToken;
        // Enter 2500 for 0.25%, 250 for 2.5%, and 25 for 25%.
        listOfLLC[LLC].loanRate = loan;
        listOfLLC[LLC].feeRate = fee;
        listOfLLC[LLC].active = true;
    }

    // changes loanRate only
    function changeLoanRate (address LLC, uint32 loan) public onlyOwner {
        listOfLLC[LLC].loanRate = loan;
    }

    // changes feeRate only
    function changeFeeRate (address LLC, uint32 fee) public onlyOwner {
        listOfLLC[LLC].feeRate = fee;
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

    // Claim - remove any airdropped tokens
    // currently sends all tokens to "to" address (in param)
    function claimTokens(address _tokenAddr, address to) public onlyOwner {
        uint256 tokenBal = IERC20(_tokenAddr).balanceOf(address(this));
        require(IERC20(_tokenAddr).transfer(to, tokenBal), "UND: misc. Token Transfer Failed");
    }

}