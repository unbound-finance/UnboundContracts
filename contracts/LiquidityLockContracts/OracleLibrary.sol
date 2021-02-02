// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.7.5;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";

// Interfaces
import "../Interfaces/chainlinkOracleInterface.sol";

// import "../Interfaces/IUniswapV2Pair.sol";
// import "../Interfaces/IValuing_01.sol";
// import "../Interfaces/IUnboundToken.sol";
// import "../Interfaces/IERC20.sol";

library OracleLibrary {
    using SafeMath for uint256;
    using Address for address;

    function getDecimals(address query) internal view returns (uint256) {
        return uint256(AggregatorV3Interface(query).decimals());
    }

    // check baseAsset price for existing pair on chainlink (direct)
    function checkBaseAssetValue(address baseAssetAddr, uint8 percentDiff) internal view {
        (, int256 price, , , ) = AggregatorV3Interface(baseAssetAddr).latestRoundData();
        uint256 _baseAssetValue = uint256(price);
        uint256 _decimals = getDecimals(baseAssetAddr);
        _baseAssetValue = _baseAssetValue / (10**(_decimals - 2));
        require(
            _baseAssetValue <= (100 + percentDiff) && _baseAssetValue >= (100 - percentDiff),
            "stableCoin not stable"
        );
    }

    // check baseAsset price for existing pair on chainlink (Triangulated)
    function checkBaseAssetValueTriangulate(
        address baseAssetAddr,
        address secondBaseAsset,
        uint8 percentDiff
    ) internal view {
        (, int256 price, , , ) = AggregatorV3Interface(baseAssetAddr).latestRoundData();
        (, int256 price2, , , ) = AggregatorV3Interface(secondBaseAsset).latestRoundData();

        uint256 _baseAssetValue = uint256(price);
        uint256 _secondBaseAsset = uint256(price2);

        // get amount of decimals to normalize by.
        uint256 firstBaseDecimal = getDecimals(baseAssetAddr);
        uint256 secondBaseDecimal = getDecimals(secondBaseAsset);
        uint256 toNormalize = firstBaseDecimal.add(secondBaseDecimal).sub(2);

        uint256 finalPrice = _baseAssetValue.mul(_secondBaseAsset).div(10**(toNormalize));

        require(finalPrice <= (100 + percentDiff) && finalPrice >= (100 - percentDiff), "stableCoin not stable");
    }

    // Returns latest price from ChainLink Oracle (direct)
    function getLatestPrice(address assetAddr) internal view returns (uint256) {
        (, int256 price, , , ) = AggregatorV3Interface(assetAddr).latestRoundData();
        return uint256(price);
    }

    // Returns latest price from ChainLink Oracle (Triangulation)
    function getLatestPriceTriangulate(address erc20PriceAddr, address ethPriceAddr) internal view returns (uint256) {
        // bat price in ETH
        (, int256 price, , , ) = AggregatorV3Interface(erc20PriceAddr).latestRoundData();

        // ETH price in USD
        (, int256 price2, , , ) = AggregatorV3Interface(ethPriceAddr).latestRoundData();

        // convert to uint256
        uint256 priceA = uint256(price);
        uint256 priceB = uint256(price2);

        // get decimals
        uint256 ethPriceDecimal = getDecimals(ethPriceAddr);

        // multiply prices
        uint256 finalPrice = priceA.mul(priceB).div(10**ethPriceDecimal);

        return finalPrice;
    }

    function getPriceFeeds(bool _triangulatePriceFeed, address[] memory _addresses) internal view returns (uint256) {
        // get latest price from oracle
        if (_triangulatePriceFeed) {
            return getLatestPriceTriangulate(_addresses[0], _addresses[1]);
        } else {
            return getLatestPrice(_addresses[0]);
        }
    }

    function checkBaseAssetPrices(
        bool _triangulateBaseAsset,
        uint8 _maxPercentDiffBaseAsset,
        address[] memory _addresses
    ) internal view {
        // check if baseAsset value is stable
        if (_triangulateBaseAsset) {
            checkBaseAssetValueTriangulate(_addresses[0], _addresses[1], _maxPercentDiffBaseAsset);
        } else {
            checkBaseAssetValue(_addresses[0], _maxPercentDiffBaseAsset);
        }
    }
}
