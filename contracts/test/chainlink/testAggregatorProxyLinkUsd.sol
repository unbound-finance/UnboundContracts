// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.7.5;

import "./testAggregatorProxyBase.sol";

contract TestAggregatorProxyLinkUsd is TestAggregatorProxyBase {
    constructor() {
        _decimals = 8;
    }

    // 2021-02-29 13:22 2311033776 in Kovan
}
