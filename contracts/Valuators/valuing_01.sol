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

    // Admin Change in-prog
    event ChangingAdmin(address indexed oldAdmin, address indexed newAdmin);

    // Admin Changed
    event AdminChanged(address indexed newAdmin);

    // Other Admin Events
    event NewLLC(address indexed LLCAddr, address indexed UTokenAddr, uint32 loanAmt, uint32 feeAmt);
    event LTVChange(address indexed LLCAddr, uint32 newLTV);
    event FeeChange(address indexed LLCAddr, uint32 newFee);
    event LLCDisable(address indexed LLCAddr);

    //Owner Address
    address private _owner;

    // 2-step owner change variables
    address private _ownerPending;
    bool private _isPending = false;

    // Liquidity Lock Contract structs - contains fee and loan rate
    struct LiquidityLock {
        uint32 feeRate; // this will contain the number by obtained by multiplying the rate by 10 ^ 6
        uint32 loanRate; // i.e. for 50%, this value would be 500000, because 100.mul(500000).div(10**6) will return 50% of the original number
        address uToken; // address of uToken to mint for the specific LLC.
        bool active; // bool that indicates if address is allowed for use.
    }

    // mapping of Approved LLC Contract structs
    mapping(address => LiquidityLock) listOfLLC;

    // number of decimals by which to divide fee multiple by.
    uint256 public constant rateBalance = (10**6);

    // Modifiers
    modifier onlyOwner() {
        require(isOwner(), "Ownable: caller is not the owner");
        _;
    }

    // Constructor
    constructor() {
        _owner = msg.sender;
    }

    // Token Creation Function - only called from LLC
    //
    // receives the total value (in uToken) of the locked liquidity from LLC,
    // calculates loan amount in uToken using loanRate variable from struct
    function unboundCreate(
        uint256 amount,
        address user,
        uint256 minTokenAmount
    ) external {
        require(user != address(0), "Valuator: cannot be zero address");
        require(user != address(this), "valuator: cannot be this address");
        require(amount > 0, "Cannot valuate nothing");
        require(listOfLLC[msg.sender].active, "LLC not authorized");
        
        IUnboundToken unboundContract = IUnboundToken(listOfLLC[msg.sender].uToken);
        // computes loan amount
        
        uint256 loanAmt = amount.mul(listOfLLC[msg.sender].loanRate).div(rateBalance);
        require(loanAmt > 0, "Cannot mint 0 loan value");
       
        
        // computes fee amount
        
        // require(loanAmt.mul(listOfLLC[msg.sender].feeRate) >= rateBalance, "Too small loan value to pay the fee");
        uint256 feeAmt = loanAmt.mul(listOfLLC[msg.sender].feeRate).div(rateBalance);
        
        
        require(minTokenAmount <= loanAmt.sub(feeAmt), "Valuing: minting less tokens than minimum amount");
        
        // calls mint
        unboundContract.mint(user, loanAmt, feeAmt, msg.sender);
    }

    // Loan repayment Intermediary - only called from LLC
    function unboundRemove(uint256 toUnlock, address user) external {
        require(user != address(0), "Valuator: cannot be zero address");
        require(user != address(this), "valuator: cannot be this address");
        require(listOfLLC[msg.sender].active, "LLC not authorized");

        // obtains amount of loan user owes (in uToken)
        IUnboundToken unboundContract = IUnboundToken(listOfLLC[msg.sender].uToken);

        // calls burn
        unboundContract.burn(user, toUnlock, msg.sender);
    }

    // returns the fee and loanrate variables attached to an LLC
    function getLLCStruct(address LLC) public view returns (uint32 fee, uint32 loanrate) {
        fee = listOfLLC[LLC].feeRate;
        loanrate = listOfLLC[LLC].loanRate;
    }

    // onlyOwner Functions

    // grants an LLC permission //
    function addLLC(
        address LLC,
        address uToken,
        uint32 loan,
        uint32 fee
    ) external onlyOwner {
        checkAddress(LLC);
        checkAddress(uToken);
        require(!listOfLLC[LLC].active, "valuator: cannot activate active LLC");
        require(fee > 0 && fee <= rateBalance, "Valuator: invalid fee amount");
        require(loan > 0 && loan <= rateBalance, "Valuator: invalid loan amount");
        // add uToken to mint
        listOfLLC[LLC].uToken = uToken;
        // Enter 2500 for 0.25%, 25000 for 2.5%, and 250000 for 25%.
        listOfLLC[LLC].loanRate = loan;
        listOfLLC[LLC].feeRate = fee;
        listOfLLC[LLC].active = true;
        emit NewLLC(LLC, uToken, loan, fee);
    }

    // changes loanRate only
    function changeLoanRate(address LLC, uint32 loan) external onlyOwner {
        checkAddress(LLC);
        require(loan > 0 && loan <= rateBalance, "Valuator: invalid loan amount");
        require(listOfLLC[LLC].active, "Valuator: LLC Inactive");
        listOfLLC[LLC].loanRate = loan;
        emit LTVChange(LLC, loan);
    }

    // changes feeRate only
    function changeFeeRate(address LLC, uint32 fee) external onlyOwner {
        checkAddress(LLC);
        require(fee > 0 && fee <= rateBalance, "Valuator: invalid fee amount");
        require(listOfLLC[LLC].active, "Valuator: LLC Inactive");
        listOfLLC[LLC].feeRate = fee;
        emit FeeChange(LLC, fee);
    }

    function checkAddress(address target) internal {
        require(target != address(0), "Valuator: cannot be zero address");
        require(target != address(this), "valuator: cannot be this address");
        require(target != _owner, "valuator: target cannot be owner");
    }

    // Disables an LLC:
    function disableLLC(address LLC) external onlyOwner {
        listOfLLC[LLC].active = false;
        emit LLCDisable(LLC);
    }

    // Checks if sender is owner
    function isOwner() public view returns (bool) {
        return msg.sender == _owner;
    }

    // Changes owner (part 1)
    function setOwner(address _newOwner) external onlyOwner {
        _ownerPending = _newOwner;
        _isPending = true;
        emit ChangingAdmin(msg.sender, _newOwner);
    }

    // changes owner (part 2)
    function claimOwner() external {
        require(_isPending, "Change was not initialized");
        require(_ownerPending == msg.sender, "You are not pending owner");
        _owner = _ownerPending;
        _isPending = false;
        emit AdminChanged(msg.sender);
    }

    // Claim - remove any airdropped tokens
    // currently sends all tokens to "to" address (in param)
    function claimTokens(address _tokenAddr, address to) external onlyOwner {
        uint256 tokenBal = IERC20(_tokenAddr).balanceOf(address(this));
        require(IERC20(_tokenAddr).transfer(to, tokenBal), "Valuing: misc. Token Transfer Failed");
    }
}
