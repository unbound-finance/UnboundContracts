pragma solidity >=0.4.23 <0.8.0;

import '../UniswapV2ERC20.sol';

abstract contract ERC20_0 is UniswapV2ERC20 {
    constructor(uint _totalSupply) {
        _mint(msg.sender, _totalSupply);
    }
}
