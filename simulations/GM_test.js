/* eslint-disable no-undef */
/*
 * OpenZeppelin Test Helpers
 * https://github.com/OpenZeppelin/openzeppelin-test-helpers
 */
const { BN, constants, balance, expectEvent, expectRevert } = require("@openzeppelin/test-helpers");
const helper = require("../test/helper");

/*
 *  ========================================================
 *  Tests of public & external functions in Tier1a contract
 *  ========================================================
 */
const uDai = artifacts.require("UnboundDollar");
const valuing = artifacts.require("Valuing_01");
const LLC = artifacts.require("LLC_EthDai");
const testDai = artifacts.require("TestDai");
const testEth = artifacts.require("TestEth");
const uniFactory = artifacts.require("UniswapV2Factory");
const uniPair = artifacts.require("UniswapV2Pair");
const weth9 = artifacts.require("WETH9");
const router = artifacts.require("UniswapV2Router02");
const testAggregatorEth = artifacts.require("TestAggregatorProxyEthUsd");
const testAggregatorDai = artifacts.require("TestAggregatorProxyDaiUsd");
const Oracle = artifacts.require("UniswapV2PriceProvider");

contract("Scenario", function (_accounts) {
  // Initial settings
  const totalSupply = 0;
  const decimal = 10 ** 18;
  const owner = _accounts[0];
  const safu = _accounts[1];
  const devFund = _accounts[2];
  const user = _accounts[3];
  const daiAmount = new BN("1000000000000000000");
  const ethAmount = new BN("500000000000000000");
  const rateBalance = 10 ** 6;
  const loanRate = 500000;
  const feeRate = 5000;
  const stakeSharesPercent = 50;
  const safuSharesPercent = 50;
  const CREnd = 20000;
  const CRNorm = 10000;
  const blockLimit = 10;
  const ethPrice = "200000000000"; // this should trigger GM. Expected price is 1000. This is 850
  const daiPrice = "1000000000000000000";

  let und;
  let valueContract;
  let lockContract;
  let tDai;
  let tEth;
  let factory;
  let pair;
  let route;
  let storedFeeTotal = 0;
  let stakePair;
  let oracle;

  //=================
  // Default Functionality
  //=================
  describe("Lock and burn LPT scenario", () => {
    before(async () => {
      tEth = await testEth.deployed();
      tDai = await testDai.deployed();
      route = await router.deployed();
      und = await uDai.deployed();
      valueContract = await valuing.deployed();
      lockContract = await LLC.deployed();
      factory = await uniFactory.deployed();
      priceFeedEth = await testAggregatorEth.deployed();
      priceFeedDai = await testAggregatorDai.deployed();
      oracle = await Oracle.deployed();

      // Set price to aggregator
      await priceFeedEth.setPrice(ethPrice);
      await priceFeedDai.setPrice(daiPrice);

      pair = await uniPair.at(await lockContract.pair());
      await tDai.approve(route.address, daiAmount);
      await tEth.approve(route.address, ethAmount);
      let d = new Date();
      let time = d.getTime();
      await route.addLiquidity(
        tDai.address,
        tEth.address,
        daiAmount,
        ethAmount,
        3000,
        10,
        owner,
        parseInt(time / 1000 + 100)
      );

      // await tDai.approve(route.address, new BN("400000000000000000000"));
      // await route.swapExactTokensForTokens(
      //   new BN("400000000000000000000"),
      //   new BN("1"),
      //   [tDai.address, tEth.address],
      //   _accounts[1],
      //   10000000000000
      // )

      // await tEth.approve(route.address, new BN("1000000000000000000"));
      // await route.swapExactTokensForTokens(
      //   new BN("1000000000000000000"),
      //   new BN("1"),
      //   [tEth.address, tDai.address],
      //   _accounts[1],
      //   10000000000000
      // )

      let stakePool = await factory.createPair(tDai.address, und.address);
      stakePair = await uniPair.at(stakePool.logs[0].args.pair);
      await und.changeStaking(stakePair.address);
    });

    it("Scenario 1", async () => {
      const LPTbal = await pair.balanceOf(owner);
      console.log("LP Balance", LPTbal.toString());

      const LPtokens = LPTbal; // Amount of token to be lock

      const decimal18 = new BN("1000000000000000");
      const totalUSD = daiAmount * 2; // Total value in Liquidity pool
      const totalLPTokens = parseInt(await pair.totalSupply()); // Total token amount of Liq pool
      const LPTValueInDai = parseInt(totalUSD / totalLPTokens); //% value of Liq pool in Dai
      const loanAmount = parseInt((LPTValueInDai * loanRate) / rateBalance); // Loan amount that user can get
      const feeAmount = parseInt((loanAmount * feeRate) / rateBalance); // Amount of fee
      const stakingAmount = 0;

      // Set price to aggregator
      await priceFeedEth.setPrice(ethPrice);
      await priceFeedDai.setPrice(daiPrice);

      console.log((await priceFeedEth.latestRoundData()).answer.toString());

      const priceOfEthPrice = await priceFeedEth.latestRoundData();
      const contractFeed = await oracle.priceOracle();

      const latestPrice = await oracle.getLatestPrice();

      console.log("Latest Price", latestPrice.toString());

      // const latestPrice0 = await oracle.getLatestPrice(tEth.address);
      // const latestPrice1 = await oracle.getLatestPrice(tDai.address);

      console.log({
        price: priceOfEthPrice.answer.toString(),
        originalOracle: priceFeedEth.address,
        contractFeed: contractFeed,
        // latestPrice: latestPrice0,
        // latestPrice1: latestPrice1
      });

      await pair.approve(lockContract.address, LPtokens);
      const receipt = await lockContract.lockLPT(LPtokens, loanAmount - feeAmount);

      const initialLPLocked = await pair.balanceOf(lockContract.address);

      const ownerBal = await und.balanceOf(owner);

      const reserves = await pair.getReserves();

      const oraclePrice = await oracle.latestAnswer();

      const reserveValue1 = await oracle.getReserveValue(0, "1000000000000000000");
      const reserveValue2 = await oracle.getReserveValue(1, "500000000000000000");

      const isPegged0 = await oracle.isPeggedToUSD(0);
      const isPegged1 = await oracle.isPeggedToUSD(1);

      console.log({
        reserveValue1: reserveValue1.toString(),
        reserveValue2: reserveValue2.toString(),
        isPegged0: isPegged0,
        isPegged1: isPegged1,
      });

      console.log("OraclePrice", oraclePrice.toString());

      // const latestPrice = await oracle.getLatestPrice()

      // console.log("Latest Price", latestPrice.toString())

      const getGeometricMean = await oracle.getWeightedGeometricMean("1000000000000000000", "2000000000000000000");
      // const checkDiff = await oracle.checkDiff("200000000000000", "2000000000000000000")

      // console.log("Check Diff",checkDiff.toString())

      console.log("Geometric Mean", getGeometricMean.toString());
      // // console.log(reserves)

      console.log({
        reserve0: reserves._reserve0.toString(),
        reserve1: reserves._reserve1.toString(),
      });

      const totalSupply = await oracle.getTotalSupplyAtWithdrawal();
      console.log("totalSupply", totalSupply.toString());
      console.log("LP totalSupply", totalLPTokens);
      console.log(`LP Tokens Locked: ${parseInt(initialLPLocked.div(decimal18)) / 1000}`);
      console.log(`UND Minted: ${parseInt(ownerBal.div(decimal18)) / 1000} `);

      // const toUnlock = (await und.balanceOf(owner)).div(new BN("20"));
      // const beingUnlocked = parseFloat(toUnlock.div(decimal18));
      await lockContract.unlockLPT("30464662718675330000")

      const LPTBal = await pair.balanceOf(account)
      console.log()
      // //   const stakingBal = parseInt(await und.balanceOf(stakePair.address));
      // const loanedAmount = await und.checkLoan(owner, lockContract.address);
      // console.log(`Amount Owed: ${parseInt(loanedAmount.div(decimal18)) / 1000}`);
      // let remaining = parseFloat(ownerBal.div(decimal18));
      // let run = 1;
      // while (remaining > 1) {
      //   await helper.advanceBlockNumber(blockLimit);

      //   const toUnlock = (await und.balanceOf(owner)).div(new BN("20"));
      //   const beingUnlocked = parseFloat(toUnlock.div(decimal18))
      //   // await lockContract.unlockLPT(toUnlock)
      //   const newBalanceUND = (await und.balanceOf(owner)).div(decimal18);
      //   const newLPBalance = (await pair.balanceOf(owner)).div(decimal18);
      //   const lockedLP = (await lockContract.tokensLocked(owner)).div(decimal18);
      //   console.log(" ");
      //   console.log(`Run #: ${run}`);
      //   console.log(`UND to unlock: ${parseInt(beingUnlocked) / 1000}`);
      //   console.log(`new remaining UND: ${parseInt(newBalanceUND) / 1000}`);
      //   console.log(`new LP Balance: ${parseInt(newLPBalance) / 1000}`);
      //   console.log(`LPs locked in LLC: ${parseInt(lockedLP) / 1000}`);
      //   console.log(" ");
      //   console.log(" ---- ");
      //   remaining = parseInt(newBalanceUND) / 1000;
      //   storedFeeTotal += feeAmount - stakingAmount;
      //   run++
      // }

      //   assert.equal(ownerBal, loanAmount - feeAmount, "owner balance incorrect");
      //   assert.equal(stakingBal, stakingAmount, "staking balance incorrect");
      //   assert.equal(loanedAmount, loanAmount, "loaned amount incorrect");
    });
  });
});
