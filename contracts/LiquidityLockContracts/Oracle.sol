// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.7.5;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";
// TODO: Should we remove it or not
import "@openzeppelin/contracts/utils/Address.sol";
import "../Interfaces/IUniswapV2Pair.sol";

import "../Interfaces/chainlinkOracleInterface.sol";
import "../Interfaces/IOracle.sol";

import "../utils/Math.sol";

contract UniswapV2PriceProvider is IUniswapV2PriceProvider {
    using SafeMath for uint256;
    IUniswapV2Pair public immutable pair;
    address[] public tokens;
    bool[] public isPeggedToUSD;
    uint8[] public decimals;
    uint8[] public feedDecimals;
    uint256 public maxPercentDiff;
    uint256 public allowedDelay;
    AggregatorV3Interface priceOracle;

    uint256 public test;
    uint256 public test2;

    /**
     * UniswapV2PriceProvider constructor.
     * @param _pair Uniswap V2 pair address.
     * @param _isPeggedToUSD For each token, true if it is pegged to USD.
     * @param _decimals Number of decimals for each token.
     * @param _priceOracle Chainlink Price Oracle
     * @param _maxPercentDiff Threshold of spot prices deviation: 10ˆ16 represents a 1% deviation.
     * @param _allowedDelay Allowed delay between the last updated Chainlink price, in seconds
     */
    constructor(
        IUniswapV2Pair _pair,
        bool[] memory _isPeggedToUSD,
        uint8[] memory _decimals,
        // TODO: Replace this with Chainlink
        AggregatorV3Interface _priceOracle,
        uint256 _maxPercentDiff,
        uint256 _allowedDelay
    ) public {
        require(_isPeggedToUSD.length == 2, "ERR_INVALID_PEGGED_LENGTH");
        require(_decimals.length == 2, "ERR_INVALID_DECIMALS_LENGTH");
        require(_decimals[0] <= 18 && _decimals[1] <= 18, "ERR_INVALID_DECIMALS");
        require(address(_priceOracle) != address(0), "ERR_INVALID_PRICE_PROVIDER");
        require(_maxPercentDiff < Math.BONE, "ERR_INVALID_PRICE_DEVIATION");

        pair = _pair;
        //Get tokens
        tokens.push(_pair.token0());
        tokens.push(_pair.token1());
        isPeggedToUSD = _isPeggedToUSD;
        decimals = _decimals;
        // TODO: add logic for triangulation here
        priceOracle = _priceOracle;
        maxPercentDiff = _maxPercentDiff;
        allowedDelay = _allowedDelay;
    }

    /**
     * Returns geometric mean of both reserves, multiplied by price of Chainlink.
     * @param _reserveInStablecoin_0 reserves of the first asset
     * @param _reserveInStablecoin_1 reserves of second asset
     */
    function getWeightedGeometricMean(uint256 _reserveInStablecoin_0, uint256 _reserveInStablecoin_1)
        internal
        view
        returns (uint256)
    {
        uint256 square = Math.bsqrt(Math.bmul(_reserveInStablecoin_0, _reserveInStablecoin_1), true);
        return Math.bdiv(Math.bmul(Math.TWO_BONES, square), getTotalSupplyAtWithdrawal());
    }

    /**
     * Calculates the price of the pair token using the formula of arithmetic mean.
     * @param _reserveInStablecoin_0 Total eth for token 0.
     * @param _reserveInStablecoin_1 Total eth for token 1.
     */
    function getArithmeticMean(uint256 _reserveInStablecoin_0, uint256 _reserveInStablecoin_1)
        internal
        view
        returns (uint256)
    {
        uint256 totalEth = _reserveInStablecoin_0 + _reserveInStablecoin_1;
        return Math.bdiv(totalEth, getTotalSupplyAtWithdrawal());
    }

    /**
     * Returns Uniswap V2 pair total supply at the time of withdrawal.
     */
    function getTotalSupplyAtWithdrawal() private view returns (uint256 totalSupply) {
        totalSupply = pair.totalSupply();
        address feeTo = IUniswapV2Factory(IUniswapV2Pair(pair).factory()).feeTo();
        bool feeOn = feeTo != address(0);
        if (feeOn) {
            uint256 kLast = IUniswapV2Pair(pair).kLast();
            if (kLast != 0) {
                (uint112 reserve_0, uint112 reserve_1, ) = pair.getReserves();
                uint256 rootK = Math.bsqrt(uint256(reserve_0).mul(reserve_1), false);
                uint256 rootKLast = Math.bsqrt(kLast, false);
                if (rootK > rootKLast) {
                    uint256 numerator = totalSupply.mul(rootK.sub(rootKLast));
                    uint256 denominator = rootK.mul(5).add(rootKLast);
                    uint256 liquidity = numerator / denominator;
                    totalSupply = totalSupply.add(liquidity);
                }
            }
        }
    }

    /**
     * Returns decimals of Chainlink feed
     */
    function getDecimals(address query) internal view returns (uint256) {
        return uint256(AggregatorV3Interface(query).decimals());
    }

    /**
     * Returns latest price from the Chainlink reserves
     * @param _asset Token index.
     */
    function getLatestPrice(address _asset) internal view returns (uint256) {
        (, int256 _price, , uint256 updatedAt, ) = AggregatorV3Interface(_asset).latestRoundData();
        require(updatedAt >= block.timestamp.sub(allowedDelay), "price oracle data is too old. Wait for update.");
        uint256 price = uint256(_price);
        uint256 _decimal = getDecimals(_asset);
        if (_decimal < 18) {
            uint256 missingDecimals = uint256(18).sub(_decimal);
            price = price.mul(10**missingDecimals);
        } else if (_decimal > 18) {
            uint256 extraDecimals = _decimal.sub(18);
            price = price.div(10**extraDecimals);
        }
        return price;
    }

    /**
     * Returns reserve value in dollars
     * @param index Token index.
     * @param reserve Token reserves.
     */
    function getReserveValue(uint256 index, uint112 reserve) internal view returns (uint256) {
        uint256 pi = isPeggedToUSD[index] ? Math.BONE : uint256(getLatestPrice((tokens[index])));
        require(pi > 0, "ERR_NO_ORACLE_PRICE");
        uint256 bi;
        if (decimals[index] <= 18) {
            uint256 missingDecimals = uint256(18).sub(decimals[index]);
            bi = uint256(reserve).mul(10**(missingDecimals));
        } else if (decimals[index] > 18) {
            uint256 extraDecimals = uint256(18).sub(decimals[index]);
            bi = uint256(reserve).div(10**(extraDecimals));
        }
        return Math.bmul(bi, pi);
    }

    /**
     * Returns true if there is price difference
     * @param _reserveInStablecoin_0 Reserve value of first reserve in stablecoin.
     * @param _reserveInStablecoin_1 Reserve value of first reserve in stablecoin.
     */
    function hasPriceDifference(uint256 _reserveInStablecoin_0, uint256 _reserveInStablecoin_1)
        internal
        view 
        returns (bool result)
    {
        //Check for a price deviation
        uint256 price_deviation = Math.bdiv(_reserveInStablecoin_0, _reserveInStablecoin_1);
        if (price_deviation > (Math.BONE.add(maxPercentDiff)) || price_deviation < (Math.BONE.sub(maxPercentDiff))) {
            return true;
        }
        price_deviation = Math.bdiv(_reserveInStablecoin_1, _reserveInStablecoin_0);
        if (price_deviation > (Math.BONE.add(maxPercentDiff)) || price_deviation < (Math.BONE.sub(maxPercentDiff))) {
            return true;
        }
        return false;
    }

    /**
     * @dev Returns the pair's token price.
     *   It calculates the price using Chainlink as an external price source and the pair's tokens reserves using the arithmetic mean formula.
     *   If there is a price deviation, instead of the reserves, it uses a weighted geometric mean with constant invariant K.
     * @return int256 price
     */
    function latestAnswer() external override  returns (int256) {
        //Get token reserves in ethers
        
        (uint112 reserve_0, uint112 reserve_1, ) = pair.getReserves();
        
        uint256 reserveInStablecoin_0 = getReserveValue(0, reserve_0);
        test = reserveInStablecoin_0;
        uint256 reserveInStablecoin_1 = getReserveValue(1, reserve_1);
        
        
        if (hasPriceDifference(reserveInStablecoin_0, reserveInStablecoin_1)) {
            //Calculate the weighted geometric mean
            return int256(getWeightedGeometricMean(reserveInStablecoin_0, reserveInStablecoin_1));
        } else {
            //Calculate the arithmetic mean
           
            return int256(getArithmeticMean(reserveInStablecoin_0, reserveInStablecoin_1));
        }
    }
}
