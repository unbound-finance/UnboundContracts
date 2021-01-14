// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.7.5;

import "./testAggregatorProxyBase.sol";

contract TestAggregatorProxyLink is TestAggregatorProxyBase {
    constructor() {
        _decimals = 8;
    }
}
