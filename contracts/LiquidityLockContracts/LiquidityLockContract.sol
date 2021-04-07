// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.7.5;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

// Interfaces
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";
import "../Interfaces/IUniswapV2Pair.sol";
import "../Interfaces/IValuing_01.sol";
import "../Interfaces/IUnboundToken.sol";
import "../Interfaces/IERC20.sol";

import "./Oracle.sol";

// ---------------------------------------------------------------------------------------
//                                Liquidity Lock Contract V1
//
//                                for erc20/erc20 pairs
// ---------------------------------------------------------------------------------------
// This contract enables the user to take out a loan using their existing liquidity
// pool tokens (from the associated liquidity pool) as collateral. The loan is issued
// in the form of the uToken token which carries a peg to the baseAsset.
//
// This contract can be used as a factory to enable multiple liquidity pools access
// to mint uTokens. At this time, the Unbound protocol requires one of the reserve tokens
// in the liquidity pool to be a supported by Unbound as uToken.
//
// In V1, we offer the ability to take out a loan after giving permission to the LLC
// to "transferFrom", as well as an option utilizing the permit() function from within
// the uniswap liquidity pool contract.
//
// This is the main contract that the user will interact with. It is connected to Valuing,
// and then the uToken mint functions. Upon deployment of the LLC, its address must first be
// registered with the valuing contract. This can only be completed by the owner (or
// eventually a DAO).
// ----------------------------------------------------------------------------------------
contract LiquidityLockContract is Pausable {
    using SafeMath for uint256;
    // using Address for address;

    // lockLPTEvent
    event LockLPT(uint256 LPTAmt, address indexed user);

    // unlockLPTEvent
    event UnlockLPT(uint256 LPTAmt, address indexed user);

    // Admin Change in-prog
    event ChangingAdmin(address indexed oldAdmin, address indexed newAdmin);

    // Admin Changed
    event AdminChanged(address indexed newAdmin);

    // Admin Events
    event BlockLimitChange(uint8 NewLimit);
    event CREndChange(uint256 newRatio);
    event NewPercentDiff(uint8 percentDiff);
    event NewValuing(address indexed newValueAddress);

    //Owner Address
    address private _owner;

    // 2-step owner change variables
    address private _ownerPending;
    bool private _isPending = false;

    // tokens locked by users
    mapping(address => uint256) _tokensLocked;

    // next block that user can make an action in
    mapping(address => uint256) public nextBlock;
    uint256 public blockLimit;

    // Collateralization Ratio End
    uint256 public CREnd;

    // Collateralization Multiplier
    uint256 public CRNorm;

    // Interfaced Contracts
    IValuing_01 private valuingContract;
    IUniswapV2Pair private LPTContract;
    IUnboundToken private unboundContract;

    uint256 public allowedPriceDelay;

    address public baseAssetAddr;
    address public otherAssetAddr;

    UniswapV2PriceProvider oracle;

    uint256 base = 1000000000000000000;

    // Modifiers
    modifier onlyOwner() {
        require(isOwner(), "Ownable: caller is not the owner");
        _;
    }

    // Constructor - must provide valuing contract address, the associated Liquidity pool address (i.e. eth/dai uniswap pool token address),
    //               and the address of the baseAsset in the uniswap pair.
    constructor(
        address valuingAddress,
        address LPTaddress,
        address uTokenAddr,
        UniswapV2PriceProvider oracleAddress
    ) {
        _owner = msg.sender;

        // initiates interfacing contracts
        valuingContract = IValuing_01(valuingAddress);
        LPTContract = IUniswapV2Pair(LPTaddress);
        unboundContract = IUnboundToken(uTokenAddr);

        // set block limit (10 by default)
        blockLimit = 10;

        // set Collateralization Ratio
        CREnd = 20000;

        // set Collaterization Normalization
        CRNorm = 10000;

        // set oracle
        oracle = oracleAddress;

    }

    // calls transfer only, for use with non-permit lock function
    function transferLPT(uint256 amount) internal {
        require(LPTContract.transferFrom(msg.sender, address(this), amount), "LLC: Trasfer From failed");
    }

    // calls permit, then transfer
    function transferLPTPermit(
        address user,
        uint256 amount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) internal {
        LPTContract.permit(user, address(this), amount, deadline, v, r, s);
        require(LPTContract.transferFrom(msg.sender, address(this), amount), "LLC: Transfer From failed");
    }

    function lockLPTWithPermit(
        uint256 _LPTAmt,
        uint256 _deadline,
        uint8 _v,
        bytes32 _r,
        bytes32 _s,
        uint256 _minTokenAmount
    ) public whenNotPaused {
        uint256 LPTValueInDai = _LPTAmt.mul(uint256(oracle.latestAnswer())).div(base);

        // call Permit and Transfer
        transferLPTPermit(msg.sender, _LPTAmt, _deadline, _v, _r, _s);

        // map locked tokens to user address
        _tokensLocked[msg.sender] = _tokensLocked[msg.sender].add(_LPTAmt);

        // Call Valuing Contract
        valuingContract.unboundCreate(LPTValueInDai, msg.sender, _minTokenAmount); // Hardcode "0" for AAA rating

        // emit lockLPT event
        emit LockLPT(_LPTAmt, msg.sender);
    }

    // Requires approval first (permit excluded for simplicity)
    function lockLPT(uint256 LPTAmt, uint256 minTokenAmount) public whenNotPaused {
        uint256 LPTValueInDai = LPTAmt.mul(uint256(oracle.latestAnswer())).div(base);

        // transfer LPT to the address
        transferLPT(LPTAmt);

        // map locked tokens to user address
        _tokensLocked[msg.sender] = _tokensLocked[msg.sender].add(LPTAmt);

        // Call Valuing Contract
        valuingContract.unboundCreate(LPTValueInDai, msg.sender, minTokenAmount);

        // emit lockLPT event
        emit LockLPT(LPTAmt, msg.sender);
    }

    // Burn Path
    //
    // allows for partial loan payment by using the ratio of LPtokens to unlock and total LPtokens locked
    function unlockLPT(uint256 uTokenAmt) public whenNotPaused {
        require(uTokenAmt > 0, "Cannot unlock nothing");
        require(nextBlock[msg.sender] <= block.number, "LLC: user must wait");

        // sets nextBlock
        nextBlock[msg.sender] = block.number.add(blockLimit);

        // get current amount of uToken Loan
        uint256 currentLoan = unboundContract.checkLoan(msg.sender, address(this));

        // Make sure uToken to pay back is less than or equal to total owed.
        require(currentLoan >= uTokenAmt, "Insufficient liquidity locked");

        // check if repayment is partial or full
        uint256 LPTokenToReturn;
        if (currentLoan == uTokenAmt) {
            LPTokenToReturn = _tokensLocked[msg.sender];
        } else {
            LPTokenToReturn = getLPTokensToReturn(currentLoan, uTokenAmt);
            // LPTokenToReturn = uint256(10000000000000000000)
        }

        // Burning of uToken will happen first
        valuingContract.unboundRemove(uTokenAmt, msg.sender);

        // update mapping
        _tokensLocked[msg.sender] = _tokensLocked[msg.sender].sub(LPTokenToReturn);

        // send LP tokens back to user
        require(LPTContract.transfer(msg.sender, LPTokenToReturn), "LLC: Transfer Failed");

        emit UnlockLPT(LPTokenToReturn, msg.sender);
    }

    function getLPTokensToReturn(uint256 _currentLoan, uint256 _uTokenAmt) public view returns (uint256 _LPTokenToReturn) {
        uint256 valueOfSingleLPT = uint256(oracle.latestAnswer()).div(base);
        // // get current CR Ratio
        uint256 CRNow = (valueOfSingleLPT.mul(_tokensLocked[msg.sender])).mul(1000).div(_currentLoan);
        
        uint256 _LPTokenToReturn;
        // multiply by 21 (adding 3 to 18), to account for the multiplication by 1000 above.
        if (CREnd.mul(10**21).div(CRNorm) <= CRNow) {
            // LPT to send back. This number should have 18 decimals
            _LPTokenToReturn = (_tokensLocked[msg.sender].mul(_uTokenAmt)).div(_currentLoan);
        } else {
            // value of users locked LP before paying loan
            uint256 valueStart = valueOfSingleLPT.mul(_tokensLocked[msg.sender]);

            uint256 loanAfter = _currentLoan.sub(_uTokenAmt);
            // _LPTokenToReturn = valueStart.sub(valueAfter).div(valueOfSingleLPT);

            // Value After - Collateralization Ratio times LoanAfter (divided by CRNorm, then normalized with valueOfSingleLPT)
            uint256 valueAfter = CREnd.mul(loanAfter).div(CRNorm);

            // LPT to send back. This number should have 18 decimals
            _LPTokenToReturn = valueStart.sub(valueAfter).div(valueOfSingleLPT);

            return _LPTokenToReturn;
        }
    }

    function tokensLocked(address account) public view returns (uint256) {
        return _tokensLocked[account];
    }

    function pair() external view returns (address LPAddr) {
        LPAddr = address(LPTContract);
    }

    // onlyOwner Functions

    function setPause() public onlyOwner {
        _pause();
    }

    function setUnpause() public onlyOwner {
        _unpause();
    }

    function setBlockLimit(uint8 newLimit) public onlyOwner {
        require(newLimit > 0, "Block Limit cannot be 0");
        blockLimit = newLimit;
        emit BlockLimitChange(newLimit);
    }

    // set collateralization Ratio. 1 = CRNorm
    function setCREnd(uint256 ratio) public onlyOwner {
        require(ratio > 0, "Ratio cannot be 0");
        CREnd = ratio;
        emit CREndChange(ratio);
    }

    // // change allowedPriceDelay
    // function setAllowedPriceDelay(uint256 allowedDelay) public onlyOwner {
    //     require(allowedDelay > 0, "cannot set zero delay");
    //     allowedPriceDelay = allowedDelay;
    // }

    // // set Max Percent Difference
    // function setMaxPercentDifference(uint8 amount) public onlyOwner {
    //     require(amount <= 100, "Max percentage difference cannot be greater than 100");
    //     maxPercentDiff = amount;
    //     emit NewPercentDiff(amount);
    // }

    // Claim - remove any airdropped tokens
    // currently sends all tokens to "to" address (in param)
    function claimTokens(address _tokenAddr, address to) public onlyOwner {
        require(_tokenAddr != address(LPTContract), "Cannot move LP tokens");
        uint256 tokenBal = IERC20_2(_tokenAddr).balanceOf(address(this));
        require(IERC20_2(_tokenAddr).transfer(to, tokenBal), "LLC: Transfer Failed");
    }

    // Checks if sender is owner
    function isOwner() public view returns (bool) {
        return msg.sender == _owner;
    }

    // Changes owner (part 1)
    function setOwner(address _newOwner) public onlyOwner {
        _ownerPending = _newOwner;
        _isPending = true;
        emit ChangingAdmin(msg.sender, _newOwner);
    }

    // changes owner (part 2)
    function claimOwner() public {
        require(_isPending, "Change was not initialized");
        require(_ownerPending == msg.sender, "You are not pending owner");
        _owner = _ownerPending;
        _isPending = false;
        emit AdminChanged(msg.sender);
    }

    // Sets new Valuing Address
    function setValuingAddress(address _newValuing) public onlyOwner {
        require(_newValuing != address(0), "Cannot change to 0 address");
        valuingContract = IValuing_01(_newValuing);
        emit NewValuing(_newValuing);
    }
}
