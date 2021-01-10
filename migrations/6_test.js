const BigNumber = require('bignumber.js');

const attack1 = artifacts.require("pseudoFlashloanAttack1");
const attack2 = artifacts.require("pseudoFlashloanAttack2");

const router = artifacts.require("UniswapV2Router02");
const uniFactory = artifacts.require('UniswapV2Factory');
const uniPair = artifacts.require("UniswapV2Pair");

const uDai = artifacts.require("UnboundDollar");
const valuer = artifacts.require("Valuing_01");
const LLC = artifacts.require("LLC_EthDai");

const eth = artifacts.require("TestEth");
const dai = artifacts.require("testDai");
const weth = artifacts.require("WETH9");
// const undAddress = "0xa729D5cA5BcE0d275B69728881f5bB86511EA70B"

// const ethAddress = "0xFB841B3f7a33999692e498Cac36D358632de93e8";

// const daiAddress = "0x9CD539Ac8Dca5757efAc30Cd32da20CD955e0f8B";

// const routerAddress = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";

// const LLCAddress = "0x8eDe4b5897f484d0b0fB832a0eDC7D08A942DdA8";

// const ethDaiPoolAddress = "0xb0a2a806ec900bb9fe30bd7f6cadd35d74971542";



const testAddr = "0x7fD00EFBF16B83aEcAb201523fBbDB4C1376b142";
const loanReceiver = "0xbAC374b151AD65875cA7fDD900AdA25373A3D5Ce";
const chainLinkFeed = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419"
const baseAssetFeed = "0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9"

/// und:eth = 0x38c29e725ba3f1168b43dc689d2f5f30d249fa8c

// Deploys UND and 
module.exports = async (deployer, network, accounts) => {

    const owner = "0x7fD00EFBF16B83aEcAb201523fBbDB4C1376b142";


    // deploy UND and valuing
    await deployer.deploy(uDai, "unbound", "und", testAddr, testAddr);
    const UND = await uDai.deployed();
    await deployer.deploy(valuer);
    const valuing = await valuer.deployed();

    // link UND to valuing
    await UND.changeValuator.sendTransaction(
        valuing.address
    );

    // deploy testETH and testDAI
    await deployer.deploy(eth, testAddr);
    const ETH = await eth.deployed();
    await deployer.deploy(dai, testAddr, "1");
    const DAI = await dai.deployed();

    // deploy factory, WETH and router
    await deployer.deploy(uniFactory, testAddr);
    const factory = await uniFactory.deployed();

    await deployer.deploy(weth);
    const WETH = await weth.deployed();

    await deployer.deploy(router, factory.address, WETH.address);
    const uniRouter = await router.deployed();

    // create ETH/DAI LP pool
    const pairAddr = await factory.createPair.sendTransaction(ETH.address, DAI.address);
    console.log(pairAddr.receipt.logs[0].args.pair);


    // add initial liquidity of 1M ETH and 1M DAI
    let d = new Date();
    let time = d.getTime();
    let ethMil = new BigNumber(84949 * (10 ** 18));
    let daiMil = new BigNumber(100558648 * (10 ** 18));

    await ETH.approve.sendTransaction(uniRouter.address, ethMil);
    await DAI.approve.sendTransaction(uniRouter.address, daiMil);
    await uniRouter.addLiquidity.sendTransaction(
        ETH.address,
        DAI.address,
        ethMil,
        daiMil,
        ethMil,
        daiMil,
        owner,
        parseInt(time + 1000)
    );

    // deploy LLC
    await deployer.deploy(LLC, valuing.address, pairAddr.receipt.logs[0].args.pair, DAI.address, chainLinkFeed, baseAssetFeed, UND.address);
    const newLLC = await LLC.deployed();

    // newLLC.events.UnlockLPT(function (error, event) {
    //         console.log(event);
    //     })
    //     .on("connected", function (subscriptionId) {
    //         console.log(subscriptionId);
    //     })
    //     .on('data', function (event) {
    //         console.log(event); // same results as the optional callback above
    //     })

    // allow LLC in valuator
    await valuing.addLLC.sendTransaction(newLLC.address, UND.address, 500000, 2500);

    // mint some UND
    const LPPool = await uniPair.at(pairAddr.receipt.logs[0].args.pair);
    let poolTokens = await LPPool.balanceOf(owner);
    console.log('pooltokens', poolTokens.toString());
    await LPPool.approve.sendTransaction(newLLC.address, poolTokens);


    const lockAmt = (1000 * (10 ** 18)).toLocaleString('fullwide', {useGrouping:false}) 
    const unlockAmt = (100 * (10 ** 18)).toLocaleString('fullwide', {useGrouping:false}) 

    await newLLC.lockLPT.sendTransaction(lockAmt, lockAmt);


    const UNDBal = await UND.balanceOf(owner)


    console.log("tokens are locked")
    const LPBalBefore = await LPPool.balanceOf(owner)

    await newLLC.unlockLPT.sendTransaction(unlockAmt);


        // simulatting lockLPT
        const reserves = await LPPool.getReserves()
        const totalSupply = await LPPool.totalSupply()
        const undLoan = await UND.checkLoan(owner, newLLC.address)


        const token0 = await LPPool.token0()



        let reserve;

        if (token0 == DAI.address) {
            reserve = reserves._reserve0
        }
        else {
            reserve = reserves._reserve1
        }


        const valueOfSingleLPT = (reserve * 2) * 100 / totalSupply
        const valueStart = valueOfSingleLPT * lockAmt
        const loanAfter = undLoan - unlockAmt
        const valueAfter =( 1000 * loanAfter ) / 10000 * 100

        const LPTToReturn = (valueStart - valueAfter) / valueOfSingleLPT


        const LPTLockedAfter = await newLLC.tokensLocked(owner)
        const LPBalAfter = await LPPool.balanceOf(owner)
    
        
        console.log({
            UNDBal: UNDBal.toString(),
            reserve: reserve.toString(),
            reserve0: reserves._reserve0.toString(),
            reserve1: reserves._reserve1.toString(),
            totalSupply: totalSupply.toString(),
            undLoan: undLoan.toString(),
            valueOfSingleLPT: valueOfSingleLPT,
            valueStart: valueStart,
            loanAfter: loanAfter,
            valueAfter: valueAfter,
            LPTToReturn: LPTToReturn,
            LPTLockedAfter: LPTLockedAfter.toString(),
            LPBalBefore: LPBalBefore.toString(),
            LPBalAfter: LPBalAfter.toString()
        })

};