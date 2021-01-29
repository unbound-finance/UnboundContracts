// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.7.5;

import "./LiquidityLockContract.sol";

// For testing
contract LLC_LinkDai is LiquidityLockContract {
    // Constructor - must provide valuing contract address, the associated Liquidity pool address (i.e. eth/dai uniswap pool token address),
    //               and the address of the stablecoin in the uniswap pair.
    constructor(
        address valuingAddress,
        address LPTaddress,
        address stableCoin,
        address[] memory priceFeedAddress,
        address[] memory baseAssetFeed,
        address UNDAddr
    )
        LiquidityLockContract(
            valuingAddress,
            LPTaddress,
            stableCoin,
            priceFeedAddress,
            baseAssetFeed,
            UNDAddr
        )
    {}
}
