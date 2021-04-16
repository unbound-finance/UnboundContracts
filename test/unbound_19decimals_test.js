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
const testDai = artifacts.require("TestDai19");
const testEth = artifacts.require("TestEth");
const uniFactory = artifacts.require("UniswapV2Factory");
const uniPair = artifacts.require("UniswapV2Pair");
const weth9 = artifacts.require("WETH9");
const router = artifacts.require("UniswapV2Router02");
const testAggregatorEth = artifacts.require("TestAggregatorProxyEthUsd");
const testAggregatorDai = artifacts.require("TestAggregatorProxyDaiUsd");

const Oracle = artifacts.require("UniswapV2PriceProvider");

contract("unboundSystem decimals19", function (_accounts) {
  // Initial settings
  const totalSupply = 0;
  const decimal = 10 ** 18;
  const stablecoinDecimal = 10 ** 19;
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
        decimalList = [19, 18]
      } else if (pool1.toUpperCase() === tDai.address.toUpperCase()) {
        decimalList = [18, 19]
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

      const permissionLLC = await valueContract.addLLC(lockContract.address, unboundDai.address, loanRate, feeRate);
      const newValuator = await unboundDai.changeValuator(valueContract.address);
      await tDai.approve(route.address, daiAmount);
      await tEth.approve(route.address, parseInt(((daiAmount / 10) * daiPrice) / ethPrice));

      const d = new Date();
      const time = d.getTime();
      const addLiq = await route.addLiquidity(
        tDai.address,
        tEth.address,
        daiAmount,
        parseInt(((daiAmount / 10) * daiPrice) / ethPrice),
        3000,
        10,
        owner,
        parseInt(time / 1000 + 100)
      );

      const stakePool = await factory.createPair(tDai.address, unboundDai.address);
      stakePair = await uniPair.at(stakePool.logs[0].args.pair);

      await unboundDai.changeStaking(stakePair.address);
    });

    // it("cannot lockLPT() small amount", async () => {
    //   const lockAmount = 1;
    //   const anyNumber = 123;

    //   await pair.approve(lockContract.address, lockAmount);
    //   await expectRevert(lockContract.lockLPT(lockAmount, anyNumber), "Too small loan value to pay the fee");
    // });

    it("UND mint - first", async () => {
      const LPTbal = await pair.balanceOf(owner);
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
      

      const totalUSD = (new BN((daiAmount / 10).toString())).add(ethValue);
      

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
      const stakingAmount = 0;

      await helper.advanceBlockNumber(blockLimit);
      await pair.approve(lockContract.address, LPtokens);
      await lockContract.lockLPT(LPtokens, loanAmount.sub(feeAmount).sub(new BN("100")));
      const ownerBal = parseInt(await unboundDai.balanceOf(owner));
      const stakingBal = parseInt(await unboundDai.balanceOf(stakePair.address));

      assert.equal(ownerBal.toString(), loanAmount.sub(feeAmount).toString(), "owner balance incorrect");
      assert.equal(stakingBal, stakingAmount, "staking balance incorrect");
      console.log(`staking: ${stakingAmount}`);
      storedFee += parseInt(feeAmount) - stakingAmount;

      const tokenBal0 = parseInt(await unboundDai.checkLoan(owner, lockContract.address));

      assert.equal(tokenBal0.toString(), loanAmount.toString(), "loan amount incorrect");
    });

    it("UND mint - second", async () => {
      const LPTbal = await pair.balanceOf(owner);
      const LPtokens = parseInt(LPTbal.words[0] / 3);

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
      

      const totalUSD = (new BN((daiAmount / 10).toString())).add(ethValue);
      

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
      const stakingAmount = 0;

      // second mint
      await helper.advanceBlockNumber(blockLimit);
      await pair.approve(lockContract.address, LPtokens);
      await lockContract.lockLPT(LPtokens.toString(), loanAmount.sub(feeAmount).toString());
      const newBal = await pair.balanceOf(owner);

      assert.equal(newBal.toString(), LPTbal.sub(new BN(LPtokens.toString())).toString(), "valuing incorrect");
      console.log(`staking: ${stakingAmount}`);
      storedFee += feeAmount - stakingAmount;
    });

    it("UND burn", async () => {
      const totalSupply = await pair.totalSupply();
      const priceLPT = (daiAmount * 2) / parseInt(totalSupply);
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

      // burn
      await helper.advanceBlockNumber(blockLimit);
      await lockContract.unlockLPT(burnAmountUND);
      const newBal = parseInt(await pair.balanceOf(owner));

      assert.equal(newBal, LPtokens + parseInt(unlockAmountLPT), "valuing incorrect");
    });

    it("UND can transfer", async () => {
      const transferAmount = 10;
      const beforeBal = parseInt(await unboundDai.balanceOf(owner));
      const beforeUser = parseInt(await unboundDai.balanceOf(user));

      let theTransfer = await unboundDai.transfer(user, transferAmount);
      let finalBal = parseInt(await unboundDai.balanceOf(owner));
      let userBal = parseInt(await unboundDai.balanceOf(user));

      assert.equal(userBal, beforeUser + transferAmount, "receiver balance incorrect");
      assert.equal(finalBal, beforeBal - transferAmount, "sender balance incorrect");
    });

    it("UND can distribute the fee to safu and devFund", async () => {
      const beforeStoredFee = parseInt(await unboundDai.storedFee());
      assert.equal(beforeStoredFee, storedFee, "incorrect before stored fee");

      const beforeSafuBal = parseInt(await unboundDai.balanceOf(safu));
      const beforeDevFundBal = parseInt(await unboundDai.balanceOf(devFund));
      const stakingShare = parseInt((beforeStoredFee * stakeSharesPercent) / 100);
      const safuShare = parseInt(((storedFee - stakingShare) * safuSharesPercent) / 100);
      const devShare = storedFee - stakingShare - safuShare;

      await unboundDai.distributeFee({ from: user });

      const afterSafuBal = parseInt(await unboundDai.balanceOf(safu));
      const afterDevFundBal = parseInt(await unboundDai.balanceOf(devFund));
      const afterStoredFee = parseInt(await unboundDai.storedFee());

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
      let finalBalance = await tEth.balanceOf(user);

      assert.equal(10, finalBalance.words[0], "Claim is not working");
    });

    it("LLC cannot claim from its own Liquidity Pool", async () => {
      let sendEth = await tEth.transfer(lockContract.address, 10);
      await expectRevert(lockContract.claimTokens(pair.address, user), "Cannot move LP tokens");
    });

    it("LLC - other user can't pay off someone elses loan", async () => {
      let LPTbal = await pair.balanceOf(owner);
      let LPtokens = LPTbal.div(new BN("3"));

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
      

      const totalUSD = (new BN((daiAmount / 10).toString())).add(ethValue);
      

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

      // first mint
      await helper.advanceBlockNumber(blockLimit);
      await pair.approve(lockContract.address, LPtokens);
      await lockContract.lockLPT(LPtokens, loanAmount.sub(feeAmount));

      // user A balance before
      let tokenBal = await unboundDai.balanceOf(owner);
      tokenBal = parseInt(tokenBal.words[0] / 4);

      // user B balance before
      let beforeSafuBal = await unboundDai.balanceOf(user);
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
  });
});
