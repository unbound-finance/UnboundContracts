// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.7.5;

interface IUniswapV2PriceProvider {
    function latestAnswer() external  returns (int256);
}
