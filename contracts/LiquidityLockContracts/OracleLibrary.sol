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

    // check baseAsset price for existing pair on chainlink (direct)
    function checkBaseAssetValue(address baseAssetAddr, uint8 percentDiff) internal view {
        (, int256 price, , , ) = AggregatorV3Interface(baseAssetAddr).latestRoundData();
        uint256 _baseAssetValue = uint256(price);
        _baseAssetValue = _baseAssetValue / (10**6);
        require(
            _baseAssetValue <= (100 + percentDiff) &&
                _baseAssetValue >= (100 - percentDiff),
            "stableCoin not stable"
        );
    }

    // check baseAsset price for existing pair on chainlink (Triangulated)
    function checkBaseAssetValueTriangulate(address baseAssetAddr, address secondBaseAsset, uint8 percentDiff) internal view {
        (, int256 price, , , ) = AggregatorV3Interface(baseAssetAddr).latestRoundData();
        (, int256 price2, , , ) = AggregatorV3Interface(secondBaseAsset).latestRoundData();

        uint256 _baseAssetValue = uint256(price);
        uint256 _secondBaseAsset = uint256(price2);
        
        // assumes both pair oracle feeds have 8 decimals

        uint256 finalPrice = _baseAssetValue.mul(_secondBaseAsset).div(10**12);
        
        require(
            finalPrice <= (100 + percentDiff) &&
                finalPrice >= (100 - percentDiff),
            "stableCoin not stable"
        );
    }

    // Returns latest price from ChainLink Oracle (direct)
    function getLatestPrice(address assetAddr) public view returns (uint256) {
        (, int256 price, , , ) = AggregatorV3Interface(assetAddr).latestRoundData();
        return uint256(price);
    }

    // Returns latest price from ChainLink Oracle (Triangulation)
    function getLatestPriceTriangulate(address erc20PriceAddr, address ethPriceAddr) public view returns (uint256) {

        // bat price in ETH
        (, int256 price, , , ) = AggregatorV3Interface(erc20PriceAddr).latestRoundData();

        // ETH price in USD
        (, int256 price2, , , ) = AggregatorV3Interface(ethPriceAddr).latestRoundData();

        // convert to uint256
        uint256 batPrice = uint256(price);
        uint256 ethPrice = uint256(price2);

        // normalize BAT price
        batPrice = batPrice.div(10 ** 10);

        // multiply prices
        uint256 finalPrice = batPrice.mul(ethPrice);

        return finalPrice;
    }

    
}
