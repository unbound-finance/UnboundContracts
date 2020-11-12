pragma solidity >=0.4.23 <0.8.0;
// SPDX-License-Identifier: MIT

import "./LLC_EthDai.sol";

// For testing
contract LLC_LinkDai is LLC_EthDai {
    // Constructor - must provide valuing contract address, the associated Liquidity pool address (i.e. eth/dai uniswap pool token address),
    //               and the address of the stablecoin in the uniswap pair.
    constructor(
        address valuingAddress,
        address LPTaddress,
        address stableCoin,
        address uToken
    ) public LLC_EthDai(valuingAddress, LPTaddress, stableCoin, uToken) {}
}
