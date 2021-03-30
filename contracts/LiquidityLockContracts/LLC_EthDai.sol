// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.7.5;

import "./LiquidityLockContract.sol";

// For testing
contract LLC_EthDai is LiquidityLockContract {
    // Constructor - must provide valuing contract address, the associated Liquidity pool address (i.e. eth/dai uniswap pool token address),
    //               and the address of the stablecoin in the uniswap pair.
    constructor(
        address valuingAddress,
        address LPTaddress,
        address stableCoin,
        UniswapV2PriceProvider oracle
    ) LiquidityLockContract(valuingAddress, LPTaddress, stableCoin, oracle) {}
}
