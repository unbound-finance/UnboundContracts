pragma solidity >=0.4.23 <0.8.0;
// SPDX-License-Identifier: MIT

interface IUniswapV2Callee {
    function uniswapV2Call(address sender, uint amount0, uint amount1, bytes calldata data) external;
}
