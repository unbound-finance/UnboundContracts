// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.7.5;

import "./LLC_EthDai.sol";

// For testing
contract LLC_LinkDai is LLC_EthDai {
    // Constructor - must provide valuing contract address, the associated Liquidity pool address (i.e. eth/dai uniswap pool token address),
    //               and the address of the stablecoin in the uniswap pair.
    constructor(
        address valuingAddress,
        address LPTaddress,
        address stableCoin,
        address[] memory priceFeedAddress,
        address[] memory baseAssetFeed,
        address UNDAddr
    ) LLC_EthDai(valuingAddress, LPTaddress, stableCoin, priceFeedAddress, baseAssetFeed, UNDAddr) {}
}
