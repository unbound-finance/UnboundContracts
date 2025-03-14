/* eslint-disable no-undef */
/*
 * OpenZeppelin Test Helpers
 * https://github.com/OpenZeppelin/openzeppelin-test-helpers
 */
const { BN, constants, balance, expectEvent, expectRevert } = require("@openzeppelin/test-helpers");
const helper = require("./helper");

/*
 *  ========================================================
 *  Tests of public & external functions in Tier1a contract
 *  ========================================================
 */
const uDai = artifacts.require("UnboundDollar");
const valuing = artifacts.require("Valuing_01");
const LLC = artifacts.require("LLC_EthDai");
const testDai = artifacts.require("TestDai13");
const testEth = artifacts.require("TestEth");
const uniFactory = artifacts.require("UniswapV2Factory");
const uniPair = artifacts.require("UniswapV2Pair");
const weth9 = artifacts.require("WETH9");
const router = artifacts.require("UniswapV2Router02");
const testAggregatorEth = artifacts.require("TestAggregatorProxyEthUsd");
const testAggregatorDai = artifacts.require("TestAggregatorProxyDaiUsd");

const Oracle = artifacts.require("UniswapV2PriceProvider");

contract("unboundSystem decimals13", function (_accounts) {
  // Initial settings
  const totalSupply = 0;
  const decimal = 10 ** 18;
  const stablecoinDecimal = 10 ** 13;
  const amount = 0;
  const owner = _accounts[0];
  const safu = _accounts[1];
  const devFund = _accounts[2];
  const user = _accounts[3];
  const daiAmount = 400000;
  const rateBalance = 10 ** 6;
  const loanRate = 500000;
  const feeRate = 5000;
  const stakeSharesPercent = 50;
  const safuSharesPercent = 50;
  const CREnd = 20000;
  const CRNorm = 10000;
  const blockLimit = 10;
  const ethPrice = 128093000000;
  const daiPrice = 100275167;
  const base = new BN("1000000000000000000");

  let unboundDai;
  let valueContract;
  let lockContract;
  let oracle;
  let tDai;
  let tEth;
  let weth;
  let factory;
  let pair;
  let route;
  let lockedTokens;
  let storedFee = 0;
  let stakePair;

  //=================
  // Default Functionality
  //=================
  describe("Check default functionality", () => {
    before(async function () {
      unboundDai = await uDai.deployed();
      valueContract = await valuing.deployed();
      factory = await uniFactory.deployed();
      tEth = await testEth.deployed();
      tDai = await testDai.deployed();
      // lockContract = await LLC.deployed();
      weth = await weth9.deployed();
      route = await router.deployed();
      priceFeedEth = await testAggregatorEth.deployed();
      priceFeedDai = await testAggregatorDai.deployed();

      // Set price to aggregator
      await priceFeedEth.setPrice(ethPrice);
      await priceFeedDai.setPrice(daiPrice);

      const pairAddr = await factory.createPair(tDai.address, tEth.address);
      pair = await uniPair.at(pairAddr.logs[0].args.pair);

      const pool0 = await pair.token0();
      const pool1 = await pair.token1();
      let decimalList = []

      if (pool0.toUpperCase() === tDai.address.toUpperCase()) {
        decimalList = [13, 18]
      } else if (pool1.toUpperCase() === tDai.address.toUpperCase()) {
        decimalList = [18, 13]
      } else {
        console.log("PROBLEM!!!")
      }

      oracle = await Oracle.new(
        pair.address,
        // [true, false],
        decimalList,
        [priceFeedEth.address],
        "900000000000000000", //10%
        5000,
        tDai.address
      );

      lockContract = await LLC.new(
        valueContract.address,
        pairAddr.logs[0].args.pair,
        unboundDai.address,
        oracle.address
      );

      await valueContract.addLLC(lockContract.address, unboundDai.address, loanRate, feeRate);
      await unboundDai.changeValuator(valueContract.address);
      await tDai.approve(route.address, daiAmount);
      await tEth.approve(route.address, parseInt(((daiAmount * 100000) * daiPrice) / ethPrice));

      let d = new Date();
      let time = d.getTime();
      await route.addLiquidity(
        tDai.address,
        tEth.address,
        daiAmount,
        parseInt(((daiAmount * 100000) * daiPrice) / ethPrice),
        3000,
        10,
        owner,
        parseInt(time / 1000 + 100)
      );

      let stakePool = await factory.createPair(tDai.address, unboundDai.address);
      stakePair = await uniPair.at(stakePool.logs[0].args.pair);

      await unboundDai.changeStaking(stakePair.address);
    });

    // This never happen in 13 decimals
    // it("cannot call lockLPT() small amount", async () => {
    //   const lockAmount = 1;
    //   const anyNumber = 123;

    //   let approveLP = await pair.approve(
    //     lockContract.address,
    //     lockAmount
    //   );
    //   await expectRevert(
    //     lockContract.lockLPT(lockAmount, anyNumber),
    //     "amount is too small"
    //   );
    // });

    it("UND mint - first", async () => {
      const LPTbal = await pair.balanceOf.call(owner);
      const LPtokens = LPTbal.div(new BN("4")); // Amount of token to be lock
      lockedTokens = LPtokens;

      const reserves = await pair.getReserves();
    
      const ethPriceNormalized = (new BN(ethPrice.toString())).mul(new BN("10000000000"));
      
      let ethReserve;
      let ethValue;
      if (reserves._reserve0.toString() === daiAmount.toString()) {
        ethReserve = new BN(reserves._reserve1.toString());
        ethValue = ethReserve.mul(ethPriceNormalized).div(base);
        
      } else {
        ethReserve = new BN(reserves._reserve0.toString());
        ethValue = ethReserve.mul(ethPriceNormalized).div(base);
      }
      

      const totalUSD = (new BN((daiAmount * 100000).toString())).add(ethValue);
      

      const totalLPTokens = await pair.totalSupply.call(); // Total token amount of Liq pool
      const priceOfLp = totalUSD.mul(base).div(totalLPTokens)

      // const oraclePrice = await oracle.latestAnswer();
      // const LPTValueInDai = LPtokens.mul(oraclePrice).div(base);
      const LPTValueInDai = (priceOfLp.mul(LPtokens)).div(base);

      const loanRateBN = new BN(loanRate.toString());
      const feeRateBN = new BN(feeRate.toString());
      const rateBalanceBN = new BN(rateBalance.toString());
      const loanAmount = LPTValueInDai.mul(loanRateBN).div(rateBalanceBN); // Loan amount that user can get
      
      const feeAmount = (loanAmount.mul(feeRateBN).div(rateBalanceBN)); // Amount of fee
      // const stakingAmount = parseInt((feeAmount * stakeSharesPercent) / 100);
      // const daiInPool = new BN("400000");
      // const reservePrice = daiInPool.mul(new BN("1000000000000000000")).div(new BN("313"));
      // console.log(reservePrice.toString());
      const stakingAmount = 0;
      console.log("LPT value: ", LPTValueInDai.toString())
      // console.log(loanAmount.toString());
      // console.log(feeAmount.toString());

      await helper.advanceBlockNumber(blockLimit);
      await pair.approve(lockContract.address, LPtokens);
      await lockContract.lockLPT(LPtokens, 0); // loanAmount - feeAmount
      

      const ownerBal = await unboundDai.balanceOf.call(owner);
      const stakingBal = parseInt(await unboundDai.balanceOf.call(stakePair.address));

      assert.equal(ownerBal.toString(), loanAmount.sub(feeAmount).toString(), "owner balance incorrect");
      assert.equal(stakingBal, stakingAmount, "staking balance incorrect");
      console.log(`staking: ${stakingAmount}`);
      storedFee += parseInt(feeAmount) - stakingAmount;
      console.log("fee: ", feeAmount.toString())
      console.log("storedFee", storedFee);

      const beforeStoredFee = parseInt(await unboundDai.storedFee.call());
      assert.equal(beforeStoredFee, storedFee, "incorrect before stored fee");

      let tokenBal0 = await unboundDai.checkLoan.call(owner, lockContract.address);

      assert.equal(tokenBal0.toString(), loanAmount.toString(), "loan amount incorrect");
    });

    it("UND mint - second", async () => {
      let LPTbal = await pair.balanceOf.call(owner);
      let LPtokens = parseInt(LPTbal.words[0] / 3);

      const reserves = await pair.getReserves();
    
      const ethPriceNormalized = (new BN(ethPrice.toString())).mul(new BN("10000000000"));
      
      let ethReserve;
      let ethValue;
      if (reserves._reserve0.toString() === daiAmount.toString()) {
        ethReserve = new BN(reserves._reserve1.toString());
        ethValue = ethReserve.mul(ethPriceNormalized).div(base);
        
      } else {
        ethReserve = new BN(reserves._reserve0.toString());
        ethValue = ethReserve.mul(ethPriceNormalized).div(base);
      }
      

      const totalUSD = (new BN((daiAmount * 100000).toString())).add(ethValue);
      

      const totalLPTokens = await pair.totalSupply.call(); // Total token amount of Liq pool
      const priceOfLp = totalUSD.mul(base).div(totalLPTokens)

      // const oraclePrice = await oracle.latestAnswer();
      // const LPTValueInDai = LPtokens.mul(oraclePrice).div(base);
      const LPTValueInDai = (priceOfLp.mul(new BN(LPtokens.toString()))).div(base);

      const loanRateBN = new BN(loanRate.toString());
      const feeRateBN = new BN(feeRate.toString());
      const rateBalanceBN = new BN(rateBalance.toString());
      const loanAmount = LPTValueInDai.mul(loanRateBN).div(rateBalanceBN); // Loan amount that user can get
      
      const feeAmount = (loanAmount.mul(feeRateBN).div(rateBalanceBN)); // Amount of fee

      // this is old calculation which still seems to work. Will keep for now, but feeAmount is not correct.
      // const totalUSD = daiAmount * 2; // Total value in Liquidity pool
      // const totalLPTokens = parseInt(await pair.totalSupply.call()); // Total token amount of Liq pool
      // const LPTValueInDai = parseInt(((totalUSD * LPtokens) / totalLPTokens) * (decimal / stablecoinDecimal)); //% value of Liq pool in Dai
      // const loanAmount = parseInt((LPTValueInDai * loanRate) / rateBalance); // Loan amount that user can get
      // const feeAmount = parseInt((loanAmount * feeRate) / rateBalance); // Amount of fee
      const stakingAmount = 0;

      // second mint
      await helper.advanceBlockNumber(blockLimit);
      await pair.approve(lockContract.address, LPtokens);
      await lockContract.lockLPT(LPtokens.toString(), loanAmount.sub(feeAmount).toString());
      let newBal = await pair.balanceOf.call(owner);

      assert.equal(newBal.toString(), LPTbal.sub(new BN(LPtokens.toString())).toString(), "valuing incorrect");
      console.log(`staking: ${stakingAmount}`);

      storedFee += parseInt(feeAmount) - stakingAmount;
    
    });

    it("UND burn", async () => {
      const totalSupply = await pair.totalSupply();
      const priceLPT = await oracle.latestAnswer();

      const ethPriceNormalized = (new BN(ethPrice.toString())).mul(new BN("10000000000"));
      const reserves = await pair.getReserves();
      let ethReserve;
      let ethValue;
      if (reserves._reserve0.toString() === daiAmount.toString()) {
        ethReserve = new BN(reserves._reserve1.toString());
        ethValue = ethReserve.mul(ethPriceNormalized).div(base);
        
      } else {
        ethReserve = new BN(reserves._reserve0.toString());
        ethValue = ethReserve.mul(ethPriceNormalized).div(base);
      }

      const totalUSD = (new BN(daiAmount.toString())).add(ethValue);
      const totalLPTokens = await pair.totalSupply(); // Total token amount of Liq pool
      const priceOfLp = totalUSD.mul(base).div(totalLPTokens)
      

      const lockedLPT = parseInt(await lockContract.tokensLocked(owner));
      const mintedUND = parseInt(await unboundDai.checkLoan(owner, lockContract.address));

      
      const LPtokens = parseInt(await pair.balanceOf(owner));
      const tokenBalBefore = await unboundDai.balanceOf(owner);
      const burnAmountUND = parseInt(mintedUND * 0.4);
      
      const unlockAmountLPT = parseInt((lockedLPT * burnAmountUND) / mintedUND);

      // const lockedLPT = parseInt(await lockContract.tokensLocked(owner));
      // const mintedUND = parseInt(await unboundDai.checkLoan(owner, lockContract.address));
      // const burnAmountUND = mintedUND / 2;
      // const unlockAmountLPT =
      //   lockedLPT - ((((mintedUND - burnAmountUND) * stablecoinDecimal) / decimal) * CREnd) / CRNorm / priceLPT;
      // const LPtokens = parseInt(await pair.balanceOf.call(owner));

      // burn
      await helper.advanceBlockNumber(blockLimit);
      await lockContract.unlockLPT(burnAmountUND);
      let newBal = parseInt(await pair.balanceOf.call(owner));

      assert.equal(newBal, LPtokens + parseInt(unlockAmountLPT), "valuing incorrect");
    });

    it("UND can transfer", async () => {
      const transferAmount = 10;
      let beforeBal = await unboundDai.balanceOf.call(owner);
      let beforeUser = await unboundDai.balanceOf.call(user);
      beforeBal = parseInt(beforeBal.words[0]);
      beforeUser = parseInt(beforeUser.words[0]);

      let theTransfer = await unboundDai.transfer(user, transferAmount);
      let finalBal = await unboundDai.balanceOf.call(owner);
      let userBal = await unboundDai.balanceOf.call(user);
      finalBal = parseInt(finalBal.words[0]);
      userBal = parseInt(userBal.words[0]);

      assert.equal(userBal, beforeUser + transferAmount, "receiver balance incorrect");
      assert.equal(finalBal, beforeBal - transferAmount, "sender balance incorrect");
    });

    it("UND can distribute the fee to safu and devFund", async () => {
      const beforeStoredFee = parseInt(await unboundDai.storedFee.call());
      assert.equal(beforeStoredFee, storedFee, "incorrect before stored fee");
      // storedFee = beforeStoredFee;

      const beforeSafuBal = parseInt(await unboundDai.balanceOf.call(safu));
      const beforeDevFundBal = parseInt(await unboundDai.balanceOf.call(devFund));

      const stakingShare = parseInt((beforeStoredFee * stakeSharesPercent) / 100);
      const safuShare = parseInt(((storedFee - stakingShare) * safuSharesPercent) / 100);
      const devShare = storedFee - stakingShare - safuShare;
      // const safuShare = parseInt((storedFee * safuSharesPercent) / 100);

      await unboundDai.distributeFee({ from: user });

      const afterSafuBal = parseInt(await unboundDai.balanceOf.call(safu));
      const afterDevFundBal = parseInt(await unboundDai.balanceOf.call(devFund));
      const afterStoredFee = parseInt(await unboundDai.storedFee.call());

      assert.equal(afterSafuBal, beforeSafuBal + safuShare, "incorrect safu balance");
      console.log(`safa: ${safuShare}`);
      assert.equal(afterDevFundBal, beforeDevFundBal + devShare, "incorrect dev fund balance");
      console.log(`devFund: ${devShare}`);
      storedFee = 0;
      assert.equal(afterStoredFee, storedFee, "incorrect stored fee");
    });

    it("LLC can claim tokens", async () => {
      let sendEth = await tEth.transfer(lockContract.address, 10);
      let claim = await lockContract.claimTokens(tEth.address, user);
      let finalBalance = await tEth.balanceOf.call(user);

      assert.equal(10, finalBalance.words[0], "Claim is not working");
    });

    it("LLC cannot claim from its own Liquidity Pool", async () => {
      let sendEth = await tEth.transfer(lockContract.address, 10);
      await expectRevert(lockContract.claimTokens(pair.address, user), "Cannot move LP tokens");
    });

    it("LLC - other user can't pay off someone elses loan", async () => {
      let LPTbal = await pair.balanceOf.call(owner);
      let LPtokens = parseInt(LPTbal.words[0] / 3);
      const totalUSD = daiAmount * 2; // Total value in Liquidity pool
      const totalLPTokens = parseInt(await pair.totalSupply.call()); // Total token amount of Liq pool
      const LPTValueInDai = parseInt(((totalUSD * LPtokens) / totalLPTokens) * (decimal / stablecoinDecimal)); //% value of Liq pool in Dai
      const loanAmount = parseInt((LPTValueInDai * loanRate) / rateBalance); // Loan amount that user can get
      const feeAmount = parseInt((loanAmount * feeRate) / rateBalance); // Amount of fee

      // first mint
      await helper.advanceBlockNumber(blockLimit);
      await pair.approve(lockContract.address, LPtokens);
      await lockContract.lockLPT(LPtokens, loanAmount - feeAmount);

      // user A balance before
      let tokenBal = await unboundDai.balanceOf.call(owner);
      tokenBal = parseInt(tokenBal.words[0] / 4);

      // user B balance before
      let beforeSafuBal = await unboundDai.balanceOf.call(user);
      beforeSafuBal = beforeSafuBal.words[0];

      // transfer funds to other user
      let moveUND = await unboundDai.transfer(user, tokenBal);

      // Trys to unlockLPT with User B
      await helper.advanceBlockNumber(blockLimit);
      await expectRevert(
        lockContract.unlockLPT(LPtokens, {
          from: user,
        }),
        "Insufficient liquidity locked"
      );
    });

    it('LLC - test larger value', async () => {
      const daiToSend = new BN("12000000000000000");
      const ethToSend = (daiToSend.mul(new BN(daiPrice.toString())).div(new BN(ethPrice.toString())))
      await tDai.approve(route.address, daiToSend);
      await tEth.approve(route.address, ethToSend);

      let d = new Date();
      let time = d.getTime();
      await route.addLiquidity(
        tDai.address,
        tEth.address,
        daiToSend,
        ethToSend,
        3000,
        10,
        owner,
        parseInt(time / 1000 + 100)
      );
      const LPTbal = parseInt(await pair.balanceOf.call(owner));
      const LPtokens = parseInt(LPTbal / 2);

      const reserves = await pair.getReserves();
      const daiInPool = new BN("400000");
      const _totalUSD = daiInPool.add(daiInPool).mul(new BN("2"));
      const totalLPTokens = parseInt(await pair.totalSupply.call()); // Total token amount of Liq pool
      const LPTValueInDai = parseInt(((_totalUSD * LPtokens) / totalLPTokens) * (decimal / stablecoinDecimal)); //% value of Liq pool in Dai
      const loanAmount = parseInt((LPTValueInDai * loanRate) / rateBalance); // Loan amount that user can get
      const feeAmount = parseInt((loanAmount * feeRate) / rateBalance); // Amount of fee
      // const stakingAmount = parseInt((feeAmount * stakeSharesPercent) / 100);
      
      const reservePrice = daiInPool.mul(new BN("1000000000000000000")).div(new BN("313"));
      console.log(reservePrice.toString());
      const stakingAmount = 0;

      await helper.advanceBlockNumber(blockLimit);
      console.log(LPtokens);
      await pair.approve(lockContract.address, LPtokens);
      await lockContract.lockLPT(LPtokens, 0); // loanAmount - feeAmount
    })
  });
});
