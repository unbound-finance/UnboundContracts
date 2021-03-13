// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.7.5;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

// Interfaces
import "../Interfaces/chainlinkOracleInterface.sol";
import "../Interfaces/IUniswapV2Pair.sol";
import "../Interfaces/IValuing_01.sol";
import "../Interfaces/IUnboundToken.sol";
import "../Interfaces/IERC20.sol";

// import libraries
import "./OracleLibrary.sol";

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
    event LockLPT(uint256 LPTamt, address indexed user);

    // unlockLPTEvent
    event UnlockLPT(uint256 LPTamt, address indexed user);

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

    // token position of baseAsset
    uint256 public _position;

    // set this in constructor, tracks decimals of baseAsset
    uint256 public baseAssetDecimal;

    // maximum percent difference in oracle vs. standard valuation
    uint256 public maxPercentDiff;
    uint256 public maxPercentDiffBaseAsset;

    // Collateralization Ratio End
    uint256 public CREnd;

    // Collateralization Multiplier
    uint256 public CRNorm;

    // Interfaced Contracts
    IValuing_01 private valuingContract;
    IUniswapV2Pair_0 private LPTContract;
    IERC20_2 private baseAssetErc20;
    IUnboundToken private unboundContract;

    // Oracle Address Arrays
    address[] public baseAssets;
    address[] public tokenFeeds;

    bool private triangulateBaseAsset;
    bool private triangulatePriceFeed;

    uint256[] public baseAssetOracleDecimals;
    uint256[] public tokenFeedDecimals;

    uint256 public allowedPriceDelay;

    address public baseAssetAddr;
    address public otherAssetAddr;

    uint256 public test;

    function getTest() public view returns (uint256) {
        return test;
    }

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
        address baseAsset,
        address[] memory priceFeedAddress,
        address[] memory priceFeedBaseAsset,
        address uTokenAddr
    ) {
        _owner = msg.sender;

        // initiates interfacing contracts
        valuingContract = IValuing_01(valuingAddress);
        LPTContract = IUniswapV2Pair_0(LPTaddress);
        baseAssetErc20 = IERC20_2(baseAsset);
        unboundContract = IUnboundToken(uTokenAddr);

        // set block limit (10 by default)
        blockLimit = 10;

        // saves pair token addresses to memory
        address toke0 = LPTContract.token0();
        address toke1 = LPTContract.token1();

        // sets the decimals value of the baseAsset
        baseAssetDecimal = baseAssetErc20.decimals();
        require(baseAssetDecimal >= 2, "Base asset must have at least 2 decimals");
        // assigns which token in the pair is a baseAsset, updates first oracle.
        require(baseAsset == toke0 || baseAsset == toke1, "Mismatch of base asset and pool assets");
        if (baseAsset == toke0) {
            _position = 0;
            baseAssetAddr = toke0;
            otherAssetAddr = toke1;
        } else if (baseAsset == toke1) {
            _position = 1;
            baseAssetAddr = toke1;
            otherAssetAddr = toke0;
        }
        // set maxPercentDiff, used for Oracle fallback
        maxPercentDiff = 5;
        maxPercentDiffBaseAsset = 5;

        // set Collateralization Ratio
        CREnd = 20000;

        // set Collaterization Normalization
        CRNorm = 10000;

        require(priceFeedBaseAsset.length <= 2 && priceFeedBaseAsset.length != 0, "Invalid number of price feeds");
        require(priceFeedAddress.length <= 2 && priceFeedAddress.length != 0, "Invalid number of price feeds");
        // set ChainLink addresses
        baseAssets = priceFeedBaseAsset;
        tokenFeeds = priceFeedAddress;

        // Allows chainlink oracle data to be up to 10 minutes old
        allowedPriceDelay = 600;

        // sets if triangulation is enabled
        if (priceFeedBaseAsset.length == 2) {
            triangulateBaseAsset = true;
        } else {
            triangulateBaseAsset = false;
        }

        if (priceFeedAddress.length == 2) {
            triangulatePriceFeed = true;
        } else {
            triangulatePriceFeed = false;
        }

        // Assigns oracle decimals
        for (uint8 i = 0; i < priceFeedAddress.length; i++) {
            tokenFeedDecimals.push(OracleLibrary.getDecimals(priceFeedAddress[i]));
        }

        for (uint8 k = 0; k < priceFeedBaseAsset.length; k++) {
            baseAssetOracleDecimals.push(OracleLibrary.getDecimals(priceFeedBaseAsset[k]));
        }
    }

    function lockLPTBody(uint256 LPTamt) internal returns (uint256 LPTValueInDai) {
        require(LPTContract.balanceOf(msg.sender) >= LPTamt, "LLC: Insufficient LPTs");
        require(nextBlock[msg.sender] <= block.number, "LLC: user must wait");

        // sets nextBlock
        nextBlock[msg.sender] = block.number.add(blockLimit);

        uint256 totalLPTokens = LPTContract.totalSupply();

        // Acquire total baseAsset value of pair
        uint256 totalUSD = getValue();

        // This should compute % value of Liq pool in Dai. Cannot have decimals in Solidity
        LPTValueInDai = totalUSD.mul(LPTamt).div(totalLPTokens);
    }

    // Lock/Unlock functions
    // Mint path
    function lockLPTWithPermit(
        uint256 LPTamt,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s,
        uint256 minTokenAmount
    ) public whenNotPaused {
        uint256 LPTValueInDai = lockLPTBody(LPTamt);

        // call Permit and Transfer
        transferLPTPermit(msg.sender, LPTamt, deadline, v, r, s);

        // map locked tokens to user address
        _tokensLocked[msg.sender] = _tokensLocked[msg.sender].add(LPTamt);

        // Call Valuing Contract
        valuingContract.unboundCreate(LPTValueInDai, msg.sender, minTokenAmount); // Hardcode "0" for AAA rating

        // emit lockLPT event
        emit LockLPT(LPTamt, msg.sender);
    }

    // Requires approval first (permit excluded for simplicity)
    function lockLPT(uint256 LPTamt, uint256 minTokenAmount) public whenNotPaused {
        uint256 LPTValueInDai = lockLPTBody(LPTamt);
        
        // transfer LPT to the address
        transferLPT(LPTamt);

        // map locked tokens to user address
        _tokensLocked[msg.sender] = _tokensLocked[msg.sender].add(LPTamt);

        // Call Valuing Contract
        valuingContract.unboundCreate(LPTValueInDai, msg.sender, minTokenAmount);

        // emit lockLPT event
        emit LockLPT(LPTamt, msg.sender);
    }

    // Acquires total value of liquidity pool (in baseAsset) and normalizes decimals to 18.
    function getValue() internal returns (uint256 _totalUSD) {
        OracleLibrary.checkBaseAssetPrices(
            triangulateBaseAsset,
            maxPercentDiffBaseAsset,
            baseAssets,
            allowedPriceDelay
        );

        // obtain amounts of tokens in both reserves.
        (uint112 _token0_, uint112 _token1_, ) = LPTContract.getReserves();

        uint256 _token0 = uint256(_token0_);
        uint256 _token1 = uint256(_token1_);

        uint256 _baseAssetDecimal;
        uint256 otherAssetDecimal;
        uint256 reservePrice;
        // obtain total USD value
        if (_position == 0) {
            
            _baseAssetDecimal = uint256(IERC20_2(baseAssetAddr).decimals());
            if (_baseAssetDecimal < 18) {
                uint256 normalization = uint256(18).sub(_baseAssetDecimal);
                _token0 = _token0.mul(10 ** normalization);
            } else if (_baseAssetDecimal > 18) {
                uint256 normalization = _baseAssetDecimal.sub(18);
                _token0 = _token0.div(10 ** normalization);
            }

            otherAssetDecimal = uint256(IERC20_2(otherAssetAddr).decimals());
            if (otherAssetDecimal < 18) {
                uint256 normalization = uint256(18).sub(otherAssetDecimal);
                _token1 = _token1.mul(10 ** normalization);
            } else if (otherAssetDecimal > 18) {
                uint256 normalization = otherAssetDecimal.sub(18);
                _token1 = _token1.div(10 ** normalization);
            }

            _totalUSD = _token0.mul(2);

            reservePrice = _token0.mul(10 ** 18).div(_token1);
            
        } else {
            
            _baseAssetDecimal = uint256(IERC20_2(baseAssetAddr).decimals());
            if (_baseAssetDecimal < 18) {
                // here
               uint256 normalization = uint256(18).sub(_baseAssetDecimal);
                _token1 = _token1.mul(10 ** normalization); 
            } else if (_baseAssetDecimal > 18) {
                uint256 normalization = _baseAssetDecimal.sub(18);
                _token1 = _token1.div(10 ** normalization);
            }

            otherAssetDecimal = uint256(IERC20_2(otherAssetAddr).decimals());
            if (otherAssetDecimal < 18) {
                uint256 normalization = uint256(18).sub(otherAssetDecimal);
                _token0 = _token0.mul(10 ** normalization);
            } else if (otherAssetDecimal > 18) {
                uint256 normalization = otherAssetDecimal.sub(18);
                _token0 = _token0.div(10 ** normalization);
            }

            _totalUSD = _token1.mul(2);
            
            reservePrice = _token1.mul(10 ** 18).div(_token0);
            
        }

        // get latest price from oracle
        uint256 oraclePrice = OracleLibrary.getPriceFeeds(triangulatePriceFeed, tokenFeeds, allowedPriceDelay);

        checkPriceDifference(oraclePrice, reservePrice);
       
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
        }

        // Burning of uToken will happen first
        valuingContract.unboundRemove(uTokenAmt, msg.sender);

        // update mapping
        _tokensLocked[msg.sender] = _tokensLocked[msg.sender].sub(LPTokenToReturn);

        // send LP tokens back to user
        require(LPTContract.transfer(msg.sender, LPTokenToReturn), "LLC: Transfer Failed");

        // emit unlockLPT event
        // emit UnlockLPT(_tokensLocked[msg.sender], msg.sender);
        emit UnlockLPT(LPTokenToReturn, msg.sender);
    }

    function getLPTokensToReturn(uint256 _currentLoan, uint256 _uTokenAmt)
        internal
        returns (uint256 _LPTokenToReturn)
    {
        // check if baseAsset value is stable
        OracleLibrary.checkBaseAssetPrices(
            triangulateBaseAsset,
            maxPercentDiffBaseAsset,
            baseAssets,
            allowedPriceDelay
        );

        // Acquire Pool Values
        
        (uint112 _token0_, uint112 _token1_, ) = LPTContract.getReserves();

        uint256 _token0 = uint256(_token0_);
        uint256 _token1 = uint256(_token1_);

        // obtain total USD values
        uint256 oraclePrice = OracleLibrary.getPriceFeeds(triangulatePriceFeed, tokenFeeds, allowedPriceDelay);
        uint256 poolValue;

        uint256 _baseAssetDecimal;
        uint256 otherAssetDecimal;
        uint256 reservePrice;
        // uint256 oracleValue;
        if (_position == 0) {

            _baseAssetDecimal = uint256(IERC20_2(baseAssetAddr).decimals());
            if (_baseAssetDecimal < 18) {
                uint256 normalization = uint256(18).sub(_baseAssetDecimal);
                _token0 = _token0.mul(10 ** normalization);
            } else if (_baseAssetDecimal > 18) {
                uint256 normalization = _baseAssetDecimal.sub(18);
                _token0 = _token0.div(10 ** normalization);
            }

            otherAssetDecimal = uint256(IERC20_2(otherAssetAddr).decimals());
            if (otherAssetDecimal < 18) {
                uint256 normalization = uint256(18).sub(otherAssetDecimal);
                _token1 = _token1.mul(10 ** normalization);
            } else if (otherAssetDecimal > 18) {
                uint256 normalization = otherAssetDecimal.sub(18);
                _token1 = _token1.div(10 ** normalization);
            }

            poolValue = _token0.mul(2);

            reservePrice = _token0.mul(10 ** 18).div(_token1);

        } else {

            _baseAssetDecimal = uint256(IERC20_2(baseAssetAddr).decimals());
            if (_baseAssetDecimal < 18) {
               uint256 normalization = uint256(18).sub(_baseAssetDecimal);
                _token1 = _token1.mul(10 ** normalization); 
            } else if (_baseAssetDecimal > 18) {
                uint256 normalization = _baseAssetDecimal.sub(18);
                _token1 = _token1.div(10 ** normalization);
            }

            otherAssetDecimal = uint256(IERC20_2(otherAssetAddr).decimals());
            if (otherAssetDecimal < 18) {
                uint256 normalization = uint256(18).sub(otherAssetDecimal);
                _token0 = _token0.mul(10 ** normalization);
            } else if (otherAssetDecimal > 18) {
                uint256 normalization = otherAssetDecimal.sub(18);
                _token0 = _token0.div(10 ** normalization);
            }

            poolValue = _token1.mul(2);
            
            reservePrice = _token1.mul(10 ** 18).div(_token0);
            
        }
        checkPriceDifference(oraclePrice, reservePrice);

        _LPTokenToReturn = LPReturnFormulas(poolValue, _currentLoan, _uTokenAmt);

    }

    function LPReturnFormulas(uint256 _poolValue, uint256 _currentLoan_, uint256 _uTokenAmt_) internal view returns(uint256 _LPTokenToReturn_){
        uint256 totalLP = LPTContract.totalSupply();
        uint256 valueOfSingleLPT = _poolValue.mul(10**18).div(totalLP);

        // get current CR Ratio
        uint256 CRNow = (valueOfSingleLPT.mul(_tokensLocked[msg.sender])).mul(1000).div(_currentLoan_);

        // multiply by 21 (adding 3 to 18), to account for the multiplication by 1000 above.
        if (CREnd.mul(10**21).div(CRNorm) <= CRNow) {
            // LPT to send back. This number should have 18 decimals
            _LPTokenToReturn_ = (_tokensLocked[msg.sender].mul(_uTokenAmt_)).div(_currentLoan_);
        } else {
            // value of users locked LP before paying loan
            uint256 valueStart = valueOfSingleLPT.mul(_tokensLocked[msg.sender]);

            uint256 loanAfter = _currentLoan_.sub(_uTokenAmt_);

            // Value After - Collateralization Ratio times LoanAfter (divided by CRNorm, then normalized with valueOfSingleLPT)
            uint256 valueAfter = CREnd.mul(loanAfter).div(CRNorm).mul(10**18);

            // LPT to send back. This number should have 18 decimals
            _LPTokenToReturn_ = valueStart.sub(valueAfter).div(valueOfSingleLPT);
        }
    }  

    function checkPriceDifference(uint256 _oraclePrice, uint256 _reservePrice) internal {
        uint256 percentDiff;
        if (_oraclePrice > _reservePrice) {
            percentDiff = (100 * _oraclePrice.sub(_reservePrice)).div(_reservePrice);
        } else {
            percentDiff = (100 * _reservePrice.sub(_oraclePrice)).div(_oraclePrice);
        }
        test = percentDiff;
        // require(percentDiff < maxPercentDiff, "LLC: Manipulation Evident");
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

    // change allowedPriceDelay
    function setAllowedPriceDelay(uint256 allowedDelay) public onlyOwner {
        require(allowedDelay > 0, "cannot set zero delay");
        allowedPriceDelay = allowedDelay;
    }

    // set Max Percent Difference
    function setMaxPercentDifference(uint8 amount) public onlyOwner {
        require(amount <= 100, "Max percentage difference cannot be greater than 100");
        maxPercentDiff = amount;
        emit NewPercentDiff(amount);
    }

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
