// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.7.5;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";

// Interfaces
import "../Interfaces/chainlinkOracleInterface.sol";
import "../Interfaces/IUniswapV2Pair.sol";
import "../Interfaces/IValuing_01.sol";
import "../Interfaces/IUnboundToken.sol";
import "../Interfaces/IERC20.sol";

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
contract LLC_EthDai {
    using SafeMath for uint256;
    using Address for address;

    // killswitch event
    event KillSwitch(bool position);

    // lockLPTEvent
    event LockLPT(uint256 LPTamt, address indexed user);

    // unlockLPTEvent
    event UnlockLPT(uint256 LPTamt, address indexed user);

    //Owner Address
    address private _owner;

    // 2-step owner change variables
    address private _ownerPending;
    bool private _isPending = true;

    // If killSwitch = true, cannot lock LPT and mint new uTokens
    bool public killSwitch;

    // LPT address
    address public pair;

    // tokens locked by users
    mapping(address => uint256) _tokensLocked;

    // next block that user can make an action in
    mapping(address => uint256) public nextBlock;
    uint8 public blockLimit;

    // token position of baseAsset
    uint8 public _position;

    // set this in constructor, tracks decimals of baseAsset
    uint8 public baseAssetDecimal;

    // maximum percent difference in oracle vs. standard valuation
    uint8 public maxPercentDiff;
    uint8 public maxPercentDiffBaseAsset;

    // Collateralization Ratio End
    uint256 public CREnd;

    // Collateralization Multiplier
    uint256 public CRNorm;

    // Interfaced Contracts
    IValuing_01 private valuingContract;
    IUniswapV2Pair_0 private LPTContract;
    IERC20_2 private baseAssetErc20;
    IUnboundToken private unboundContract;

    // ChainLink Oracle Interface
    AggregatorV3Interface internal priceFeed;
    AggregatorV3Interface internal priceFeedBase;

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
        address priceFeedAddress,
        address priceFeedBaseAsset,
        address uTokenAddr
    ) {
        _owner = msg.sender;

        // initiates interfacing contracts
        valuingContract = IValuing_01(valuingAddress);
        LPTContract = IUniswapV2Pair_0(LPTaddress);
        baseAssetErc20 = IERC20_2(baseAsset);
        unboundContract = IUnboundToken(uTokenAddr);

        // killSwitch MUST be false for lockLPT to work
        killSwitch = false;

        // set LPT address
        pair = LPTaddress;

        // set block limit (10 by default)
        blockLimit = 10; 

        // saves pair token addresses to memory
        address toke0 = LPTContract.token0();
        address toke1 = LPTContract.token1();

        // sets the decimals value of the baseAsset
        baseAssetDecimal = baseAssetErc20.decimals();

        // assigns which token in the pair is a baseAsset, updates first oracle.
        require(baseAsset == toke0 || baseAsset == toke1, "invalid");
        if (baseAsset == toke0) {
            _position = 0;
        } else if (baseAsset == toke1) {
            _position = 1;
        }
        // set maxPercentDiff, used for Oracle fallback
        maxPercentDiff = 5;
        maxPercentDiffBaseAsset = 5;

        // set Collateralization Ratio
        CREnd = 20000;

        // set Collaterization Normalization
        CRNorm = 10000;

        // set ChainLink feed address
        priceFeed = AggregatorV3Interface(priceFeedAddress);
        priceFeedBase = AggregatorV3Interface(priceFeedBaseAsset);
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
    ) public {
        require(!killSwitch, "LLC: This LLC is Deprecated");
        require(
            LPTContract.balanceOf(msg.sender) >= LPTamt,
            "LLC: Insufficient LPTs"
        );
        require(nextBlock[msg.sender] <= block.number, "LLC: user must wait");

        uint256 totalLPTokens = LPTContract.totalSupply();

        // Acquire total baseAsset value of pair
        uint256 totalUSD = getValue();

        // This should compute % value of Liq pool in Dai. Cannot have decimals in Solidity
        uint256 LPTValueInDai = totalUSD.mul(LPTamt).div(totalLPTokens);

        // map locked tokens to user address
        _tokensLocked[msg.sender] = _tokensLocked[msg.sender].add(LPTamt);

        // call Permit and Transfer
        transferLPTPermit(msg.sender, LPTamt, deadline, v, r, s);

        // Call Valuing Contract
        valuingContract.unboundCreate(
            LPTValueInDai,
            msg.sender,
            minTokenAmount
        ); // Hardcode "0" for AAA rating

        // sets nextBlock
        nextBlock[msg.sender] = block.number.add(blockLimit);

        // emit lockLPT event
        emit LockLPT(LPTamt, msg.sender);
    }

    // Requires approval first (permit excluded for simplicity)
    function lockLPT(uint256 LPTamt, uint256 minTokenAmount) public {
        require(!killSwitch, "LLC: This LLC is Deprecated");
        require(
            LPTContract.balanceOf(msg.sender) >= LPTamt,
            "LLC: Insufficient LPTs"
        );
        require(nextBlock[msg.sender] <= block.number, "LLC: user must wait");

        uint256 totalLPTokens = LPTContract.totalSupply();

        // Acquire total baseAsset value of pair
        uint256 totalUSD = getValue();

        // This should compute % value of Liq pool in Dai.
        uint256 LPTValueInDai = totalUSD.mul(LPTamt).div(totalLPTokens);

        // map locked tokens to user
        _tokensLocked[msg.sender] = _tokensLocked[msg.sender].add(LPTamt);

        // transfer LPT to the address
        transferLPT(LPTamt);

        // Call Valuing Contract
        valuingContract.unboundCreate(
            LPTValueInDai,
            msg.sender,
            minTokenAmount
        );

        // sets nextBlock
        nextBlock[msg.sender] = block.number.add(blockLimit);

        // emit lockLPT event
        emit LockLPT(LPTamt, msg.sender);
    }

    // Acquires total value of liquidity pool (in baseAsset) and normalizes decimals to 18.
    function getValue() internal view returns (uint256 _totalUSD) {
        // check if baseAsset value is stable
        checkBaseAssetValue();

        // obtain amounts of tokens in both reserves.
        (uint112 _token0, uint112 _token1, ) = LPTContract.getReserves();

        // obtain total USD value
        if (_position == 0) {
            _totalUSD = _token0 * 2;
        } else {
            _totalUSD = _token1 * 2;
        }

        uint256 _totalUSDOracle;

        // get latest price from oracle
        _totalUSDOracle = uint256(getLatestPrice());

        // get total value
        if (_position == 0) {
            // _totalUSDOracle = _token1 * _totalUSDOracle + _token0;
            _totalUSDOracle = uint256(_token1)
                .mul(_totalUSDOracle)
                .div(10**getDecimals())
                .add(_token0);
        } else {
            // _totalUSDOracle = _token0 * _totalUSDOracle + _token1;
            _totalUSDOracle = uint256(_token0)
                .mul(_totalUSDOracle)
                .div(10**getDecimals())
                .add(_token1);
        }

        // Calculate percent difference (x2 - x1 / x1)
        uint256 percentDiff;
        if (_totalUSDOracle > _totalUSD) {
            percentDiff = (100 * _totalUSDOracle.sub(_totalUSD)).div(_totalUSD);
        } else {
            percentDiff = (100 * _totalUSD.sub(_totalUSDOracle)).div(
                _totalUSDOracle
            );
        }

        require(percentDiff < maxPercentDiff, "LLC-Lock: Manipulation Evident");

        // Token Decimal Normalization
        //
        // The following block ensures that all baseAsset valuations follow consistency with decimals
        // and match the 18 decimals used by uToken. This block also solves a potential vulnerability,
        // where a baseAsset pair which contains beyond 18 decimals could be used to calculate significantly
        // more uToken (by orders of 10). Likewise, baseAssets such as USDC or USDT with 6 decimals would also
        // result in far less uToken minted than desired.
        //
        // this should only happen if baseAsset decimals is NOT 18.
        if (baseAssetDecimal != 18) {
            // first case: tokenDecimal is smaller than 18
            // for baseAssets with less than 18 decimals
            if (baseAssetDecimal < 18) {
                // adds decimals to match 18
                _totalUSD = _totalUSD.mul(10**uint256(18 - baseAssetDecimal));
            }
            // second case: tokenDecimal is greater than 18
            // for tokens with more than 18 decimals
            else if (baseAssetDecimal > 18) {
                // removes decimals to match 18
                _totalUSD = _totalUSD.div(10**uint256(baseAssetDecimal - 18));
            }
        }
    }

    // Returns latest price from ChainLink Oracle
    function getLatestPrice() public view returns (int256) {
        (, int256 price, , , ) = priceFeed.latestRoundData();
        return price;
    }

    function getDecimals() internal view returns (uint256) {
        return uint256(priceFeed.decimals());
    }

    function getLatestPriceBaseAsset() public view returns (int256) {
        (, int256 price, , , ) = priceFeedBase.latestRoundData();
        return price;
    }

    // calls transfer only, for use with non-permit lock function
    function transferLPT(uint256 amount) internal {
        require(
            LPTContract.transferFrom(msg.sender, address(this), amount),
            "LLC: Trasfer From failed"
        );
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
        require(
            LPTContract.transferFrom(msg.sender, address(this), amount),
            "LLC: Transfer From failed"
        );
    }

    // This currently works for stablecoins... would be more challenging if baseasset is not a stablecoin.
    function checkBaseAssetValue() internal view {
        uint256 _baseAssetValue = uint256(getLatestPriceBaseAsset());
        _baseAssetValue = _baseAssetValue / (10**6);
        require(
            _baseAssetValue <= (100 + maxPercentDiffBaseAsset) &&
                _baseAssetValue >= (100 - maxPercentDiffBaseAsset),
            "stableCoin not stable"
        );
    }

    // Burn Path
    //
    // allows for partial loan payment by using the ratio of LPtokens to unlock and total LPtokens locked
    function unlockLPT(uint256 uTokenAmt) public {
        require(uTokenAmt > 0, "Cannot unlock nothing");
        require(nextBlock[msg.sender] <= block.number, "LLC: user must wait");

        // get current amount of uToken Loan
        uint256 currentLoan =
            unboundContract.checkLoan(msg.sender, address(this));

        // Make sure uToken to pay back is less than or equal to total owed.
        require(currentLoan >= uTokenAmt, "Insufficient liquidity locked");

        // check if repayment is partial or full
        if (currentLoan == uTokenAmt) {
            uint256 LPTokenToReturn = _tokensLocked[msg.sender];

            // Burning of uToken will happen first
            valuingContract.unboundRemove(uTokenAmt, msg.sender);

            // update mapping
            _tokensLocked[msg.sender] = _tokensLocked[msg.sender].sub(
                LPTokenToReturn
            );

            // send LP tokens back to user
            require(
                LPTContract.transfer(msg.sender, LPTokenToReturn),
                "LLC: Transfer Failed"
            );

            // emit unlockLPT event
            emit UnlockLPT(_tokensLocked[msg.sender], msg.sender);
        } else {
            uint256 LPTokenToReturn = getLPTokensToReturn(currentLoan, uTokenAmt);

            // Burning of uTokens will happen first
            valuingContract.unboundRemove(uTokenAmt, msg.sender);

            // update mapping
            _tokensLocked[msg.sender] = _tokensLocked[msg.sender].sub(
                LPTokenToReturn
            );

            // send LP tokens back to user
            require(
                LPTContract.transfer(msg.sender, LPTokenToReturn),
                "LLC: Transfer Failed"
            );

            // emit unlockLPT event
            emit UnlockLPT(LPTokenToReturn, msg.sender);
        }

        // sets nextBlock
        nextBlock[msg.sender] = block.number.add(blockLimit);
    }

    function getLPTokensToReturn(uint256 _currentLoan, uint256 _uTokenAmt) internal returns (uint256 _LPTokenToReturn) {
        // check if baseAsset value is stable
        checkBaseAssetValue();

        // Acquire Pool Values
        uint256 totalLP = LPTContract.totalSupply();
        (uint112 _token0, uint112 _token1, ) = LPTContract.getReserves();

        // obtain total USD values
        uint256 oraclePrice = uint256(getLatestPrice());
        uint256 poolValue;
        uint256 oracleValue;
        if (_position == 0) {
            poolValue = _token0 * 2;
            oracleValue = uint256(_token1)
                .mul(oraclePrice)
                .div(10**getDecimals())
                .add(_token0);
        } else {
            poolValue = _token1 * 2;
            oracleValue = uint256(_token0)
                .mul(oraclePrice)
                .div(10**getDecimals())
                .add(_token1);
        }

        // normalize back to value with 18 decimals
        // Calculate percent difference (x2 - x1 / x1)
        uint256 percentDiff;
        if (oracleValue > poolValue) {
            percentDiff = (100 * oracleValue.sub(poolValue)).div(poolValue);
        } else {
            percentDiff = (100 * poolValue.sub(oracleValue)).div(
                oracleValue
            );
        }

        require(
            percentDiff < maxPercentDiff,
            "LLC-Unlock: Manipulation Evident"
        );

        // this should only happen if baseAsset decimals is NOT 18.
        if (baseAssetDecimal != 18) {
            // first case: tokenDecimal is smaller than 18
            // for baseAssets with less than 18 decimals
            if (baseAssetDecimal < 18) {
                // calculate amount of decimals under 18
                poolValue = poolValue.mul(
                    10**uint256(18 - baseAssetDecimal)
                );
            }
            // second case: tokenDecimal is greater than 18
            // for tokens with more than 18 decimals
            else if (baseAssetDecimal > 18) {
                // caclulate amount of decimals over 18
                poolValue = poolValue.div(
                    10**uint256(baseAssetDecimal - 18)
                );
            }
        }

        // Calculate value of a single LP token
        // We will add some decimals to this
        uint256 valueOfSingleLPT = poolValue.mul(100).div(totalLP);
        // value of users locked LP before paying loan
        uint256 valueStart =
            valueOfSingleLPT.mul(_tokensLocked[msg.sender]);

        uint256 loanAfter = _currentLoan.sub(_uTokenAmt);

        // Value After - Collateralization Ratio times LoanAfter (divided by CRNorm, then normalized with valueOfSingleLPT)
        uint256 valueAfter = CREnd.mul(loanAfter).div(CRNorm).mul(100);

        // LPT to send back. This number should have 18 decimals
        _LPTokenToReturn =
            valueStart.sub(valueAfter).div(valueOfSingleLPT);
    }

    function tokensLocked(address account) public view returns (uint256) {
        return _tokensLocked[account];
    }

    // onlyOwner Functions

    function setBlockLimit(uint8 newLimit) public onlyOwner {
        require (newLimit > 0, "invalid number");
        blockLimit = newLimit;
    }

    // set collateralization Ratio. 1 = CRNorm
    function setCREnd(uint256 ratio) public onlyOwner {
        require(ratio > 0, "Ratio cannot be 0");
        CREnd = ratio;
    }

    // set Max Percent Difference
    function setMaxPercentDifference(uint8 amount) public onlyOwner {
        require(amount <= 100, "cannot be beyond 100");
        maxPercentDiff = amount;
    }

    // Claim - remove any airdropped tokens
    // currently sends all tokens to "to" address (in param)
    function claimTokens(address _tokenAddr, address to) public onlyOwner {
        require(_tokenAddr != pair, "Cannot move LP tokens");
        uint256 tokenBal = IERC20_2(_tokenAddr).balanceOf(address(this));
        require(
            IERC20_2(_tokenAddr).transfer(to, tokenBal),
            "LLC: Transfer Failed"
        );
    }

    // Kill Switch - deactivate locking of LPT
    function disableLock() public onlyOwner {
        killSwitch = !killSwitch;
        emit KillSwitch(killSwitch);
    }

    // Checks if sender is owner
    function isOwner() public view returns (bool) {
        return msg.sender == _owner;
    }

    // Changes owner (part 1)
    function setOwner(address _newOwner) public onlyOwner {
        _ownerPending = _newOwner;
        _isPending = true;
    }

    // changes owner (part 2)
    function claimOwner() public {
        require(_isPending, "Change was not initialized");
        require(_ownerPending == msg.sender, "You are not pending owner");
        _owner = _ownerPending;
        _isPending = false;
    }

    // Sets new Valuing Address
    function setValuingAddress(address _newValuing) public onlyOwner {
        valuingContract = IValuing_01(_newValuing);
    }
}
