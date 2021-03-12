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
    function checkBaseAssetValue(address baseAssetAddr, uint256 percentDiff, uint256 allowedDelay) internal view {
        (, int256 price, , uint256 updatedAt, ) = AggregatorV3Interface(baseAssetAddr).latestRoundData();
        require(updatedAt >= block.timestamp.sub(allowedDelay), "price oracle data is too old. Wait for update.");
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
        uint256 percentDiff,
        uint256 allowedDelay
    ) internal view {
        (, int256 price, , uint256 updatedAt, ) = AggregatorV3Interface(baseAssetAddr).latestRoundData();
        (, int256 price2, , uint256 updatedAtSecond, ) = AggregatorV3Interface(secondBaseAsset).latestRoundData();
        require(updatedAt >= block.timestamp.sub(allowedDelay), "price oracle data is too old. Wait for update.");
        require(updatedAtSecond >= block.timestamp.sub(allowedDelay), "price oracle second data is too old. Wait for update.");

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
    function getLatestPrice(address assetAddr, uint256 allowedDelay) internal view returns (uint256) {
        (, int256 _price, , uint256 updatedAt, ) = AggregatorV3Interface(assetAddr).latestRoundData();
        require(updatedAt >= block.timestamp.sub(allowedDelay), "price oracle data is too old. Wait for update.");
        uint256 price = uint256(_price);
        uint256 _decimal = getDecimals(assetAddr);
        if (_decimal < 18) {
            uint256 normalization = uint256(18).sub(_decimal);
            price = price.mul(10 ** normalization);
        } else if (_decimal > 18) {
            uint256 normalization = _decimal.sub(18);
            price = price.div(10 ** normalization);
        }
        return price;
    }

    // Returns latest price from ChainLink Oracle (Triangulation)
    function getLatestPriceTriangulate(address erc20PriceAddr, address baseAssetPriceAddr, uint256 allowedDelay) internal view returns (uint256) {
        // erc20 price in ETH
        (, int256 price, , uint256 updatedAt, ) = AggregatorV3Interface(erc20PriceAddr).latestRoundData();

        // ETH price in USD
        (, int256 price2, , uint256 updatedAtSecond, ) = AggregatorV3Interface(baseAssetPriceAddr).latestRoundData();

        require(updatedAt >= block.timestamp.sub(allowedDelay), "price oracle data is too old. Wait for update.");
        require(updatedAtSecond >= block.timestamp.sub(allowedDelay), "price oracle second data is too old. Wait for update.");

        // convert to uint256
        uint256 priceErc20 = uint256(price);
        uint256 priceBaseAsset = uint256(price2);

        // get decimals
        uint256 baseAssetPriceDecimal = getDecimals(baseAssetPriceAddr);
        if (baseAssetPriceDecimal < 18) {
            uint256 normalization = uint256(18).sub(baseAssetPriceDecimal);
            priceBaseAsset = priceBaseAsset.mul(10 ** normalization);
        } else if (baseAssetPriceDecimal > 18) {
            uint256 normalization = baseAssetPriceDecimal.sub(18);
            priceBaseAsset = priceBaseAsset.div(10 ** normalization);
        }

        uint256 erc20PriceDecimal = getDecimals(erc20PriceAddr);
        if (erc20PriceDecimal < 18) {
            uint256 normalization = uint256(18).sub(erc20PriceDecimal);
            priceErc20 = priceErc20.mul(10 ** normalization);
        } else if (erc20PriceDecimal > 18) {
            uint256 normalization = erc20PriceDecimal.sub(18);
            priceErc20 = priceErc20.div(10 ** normalization);
        }

        // multiply prices
        uint256 finalPrice = priceErc20.mul(priceBaseAsset).div(10**18);

        return finalPrice;
    }

    function getPriceFeeds(bool _triangulatePriceFeed, address[] memory _addresses, uint256 _allowedDelay) internal view returns (uint256) {
        // get latest price from oracle
        if (_triangulatePriceFeed) {
            return getLatestPriceTriangulate(_addresses[0], _addresses[1], _allowedDelay);
        } else {
            return getLatestPrice(_addresses[0], _allowedDelay);
        }
    }

    function checkBaseAssetPrices(
        bool _triangulateBaseAsset,
        uint256 _maxPercentDiffBaseAsset,
        address[] memory _addresses,
        uint256 _allowedDelay
    ) internal view {
        // check if baseAsset value is stable
        if (_triangulateBaseAsset) {
            checkBaseAssetValueTriangulate(_addresses[0], _addresses[1], _maxPercentDiffBaseAsset, _allowedDelay);
        } else {
            checkBaseAssetValue(_addresses[0], _maxPercentDiffBaseAsset, _allowedDelay);
        }
    }
}
