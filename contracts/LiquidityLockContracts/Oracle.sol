// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.7.5;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";

import "../Interfaces/IUniswapV2Pair.sol";
import "../Interfaces/chainlinkOracleInterface.sol";

contract UniswapV2PriceProvider {
    using SafeMath for uint256;
    IUniswapV2Pair public pair;
    address[] public tokens;
    bool[] public isPeggedToUSD;
    uint8[] public decimals;
    uint8[] public feedDecimals;
    uint256 public maxPercentDiff;
    uint256 public allowedDelay;
    address[] public feeds;
    address private owner;

    uint256 base = 1000000000000000000; // decimals base, 10 ^^ 18

    // Modifiers
    modifier onlyOwner() {
        require(isOwner(), "Ownable: caller is not the owner");
        _;
    }

    /**
     * UniswapV2PriceProvider constructor.
     * @param _pair Uniswap V2 pair address.
     * @param _decimals Number of decimals for each token.
     * @param _feeds Chainlink Price Oracle
     * @param _maxPercentDiff Threshold of spot prices deviation: 10ˆ16 represents a 1% deviation.
     * @param _allowedDelay Allowed delay between the last updated Chainlink price, in seconds
     * @param _stablecoin Stablecoin addresss
     */
    constructor(
        IUniswapV2Pair _pair,
        uint8[] memory _decimals,
        address[] memory _feeds,
        uint256 _maxPercentDiff,
        uint256 _allowedDelay,
        address _stablecoin
    ) public {
        // require(_isPeggedToUSD.length == 2, "ERR_INVALID_PEGGED_LENGTH");
        require(_decimals.length == 2, "ERR_INVALID_DECIMALS_LENGTH");
        // require(_decimals[0] <= 18 && _decimals[1] <= 18, "ERR_INVALID_DECIMALS");
        // require(_maxPercentDiff < base, "ERR_INVALID_PRICE_DEVIATION");

        pair = _pair;
        //Get tokens
        tokens.push(pair.token0());
        tokens.push(pair.token1());

        decimals = _decimals;
        feeds = _feeds;
        maxPercentDiff = _maxPercentDiff;
        allowedDelay = _allowedDelay;

        bool isPeggedToUSD0;
        bool isPeggedToUSD1;

        // check which one is stablecoin
        if (pair.token0() == _stablecoin) {
            isPeggedToUSD0 = true;
            isPeggedToUSD1 = false;
        } else {
            isPeggedToUSD0 = false;
            isPeggedToUSD1 = true;
        }

        isPeggedToUSD.push(isPeggedToUSD0);
        isPeggedToUSD.push(isPeggedToUSD1);

        owner = msg.sender;
    }

    // uint256 test;
    // uint256 test2;
    // function getTest() external view returns(uint256) {
    //     return test;
    // }
    // function getTest2() external view returns(uint256) {
    //     return test2;
    // }

    // Returns square root using Babylon method
    function sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
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
        uint256 input = _reserveInStablecoin_0.mul(_reserveInStablecoin_1);
        // uint256 sqrt =
        // return sqrt.mul(2 * base).div(getTotalSupplyAtWithdrawal());
        // test = sqrt(input).mul(uint256(2)).div(getTotalSupplyAtWithdrawal());
        return sqrt(input).mul(uint256(2)).mul(base).div(getTotalSupplyAtWithdrawal());
        // return uint256(1000000000000000000);
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
        uint256 totalUSD = _reserveInStablecoin_0.add(_reserveInStablecoin_1);
        return totalUSD.mul(base).div(getTotalSupplyAtWithdrawal());
    }

    /**
     * Returns Uniswap V2 pair total supply at the time of withdrawal.
     */
    function getTotalSupplyAtWithdrawal() internal view returns (uint256 totalSupply) {
        totalSupply = pair.totalSupply();
        address feeTo = IUniswapV2Factory(IUniswapV2Pair(pair).factory()).feeTo();
        bool feeOn = feeTo != address(0);
        if (feeOn) {
            uint256 kLast = IUniswapV2Pair(pair).kLast();
            if (kLast != 0) {
                (uint112 reserve_0, uint112 reserve_1, ) = pair.getReserves();
                uint256 rootK = sqrt(uint256(reserve_0).mul(reserve_1));
                uint256 rootKLast = sqrt(kLast);
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
     * Returns normalised value in 18 digits
     * @param _value Value which we want to normalise
     * @param _decimals Number of decimals from which we want to normalise
     */
    function normalise(uint256 _value, uint256 _decimals) internal view returns (uint256) {
        uint256 normalised = _value;
        if (_decimals < 18) {
            uint256 missingDecimals = uint256(18).sub(_decimals);
            normalised = uint256(_value).mul(10**(missingDecimals));
        } else if (_decimals > 18) {
            uint256 extraDecimals = _decimals.sub(uint256(18));
            normalised = uint256(_value).div(10**(extraDecimals));
        }
        return normalised;
    }

    /**
     * Returns price from Chainlink feed
     * @param _feed Chainlink feed address
     */
    function getChainlinkPrice(address _feed) internal view returns (uint256) {
        (, int256 _price, , uint256 _updatedAt, ) = AggregatorV3Interface(_feed).latestRoundData();
        // check if the oracle is expired
        require(_updatedAt >= block.timestamp.sub(allowedDelay), "price oracle data is too old. Wait for update.");
        uint256 price = normalise(uint256(_price), AggregatorV3Interface(_feed).decimals());
        return uint256(price);
    }

    /**
     * Returns latest price of the token
     */
    function getLatestPrice() public view returns (uint256) {
        uint256 price;
        if (feeds.length == 2) {
            uint256 price0 = getChainlinkPrice(feeds[0]);
            uint256 price1 = getChainlinkPrice(feeds[1]);
            price = price0 * price1;
        } else {
            price = getChainlinkPrice(feeds[0]);
        }
        return price;
    }

    /**
     * Returns reserve value in dollars
     * @param index Token index.
     * @param reserve Token reserves.
     */
    function getReserveValue(uint256 index, uint112 reserve) internal view returns (uint256) {
        uint256 chainlinkPrice;
        if (isPeggedToUSD[index]) {
            chainlinkPrice = base;
        } else {
            chainlinkPrice = uint256(getLatestPrice());
        }
        require(chainlinkPrice > 0, "ERR_NO_ORACLE_PRICE");

        uint256 reservePrice = normalise(reserve, decimals[index]);
        return uint256(reservePrice).mul(chainlinkPrice).div(base);
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
        // check for
        uint256 price_diff = _reserveInStablecoin_0.mul(base).div(_reserveInStablecoin_1);
        if (price_diff > (base.add(maxPercentDiff)) || price_diff < (base.sub(maxPercentDiff))) {
            return true;
        }
        price_diff = _reserveInStablecoin_1.mul(base).div(_reserveInStablecoin_0);
        if (price_diff > (base.add(maxPercentDiff)) || price_diff < (base.sub(maxPercentDiff))) {
            return true;
        }
        return false;
    }

    /**
     * @dev Returns the pair's price.
     *   It calculates the price using Chainlink as an external price source and the pair's tokens reserves using the arithmetic mean formula.
     *   If there is a price deviation, instead of the reserves, it uses a weighted geometric mean with constant invariant K.
     * @return int256 price
     */
    function latestAnswer() external view returns (int256) {
        //Get token reserves in ethers
        (uint112 reserve_0, uint112 reserve_1, ) = pair.getReserves();
        uint256 reserveInStablecoin_0 = getReserveValue(0, reserve_0);
        uint256 reserveInStablecoin_1 = getReserveValue(1, reserve_1);
        if (hasPriceDifference(reserveInStablecoin_0, reserveInStablecoin_1)) {
            //Calculate the weighted geometric mean
            return int256(getWeightedGeometricMean(reserveInStablecoin_0, reserveInStablecoin_1));
        } else {
            //Calculate the arithmetic mean
            return int256(getArithmeticMean(reserveInStablecoin_0, reserveInStablecoin_1));
            // return int256(getWeightedGeometricMean(reserveInStablecoin_0, reserveInStablecoin_1));
        }
    }

    /**
     * Check if msg.sender is owner
     */
    function isOwner() public view returns (bool) {
        return msg.sender == owner;
    }

    // change allowedPriceDelay
    function setAllowedPriceDelay(uint256 _allowedDelay) public onlyOwner {
        require(_allowedDelay > 0, "cannot set zero delay");
        allowedDelay = _allowedDelay;
    }

    // set Max Percent Difference
    function setMaxPercentDifference(uint256 amount) public onlyOwner {
        require(amount <= 100, "Max percentage difference cannot be greater than 100");
        maxPercentDiff = amount;
    }
}
