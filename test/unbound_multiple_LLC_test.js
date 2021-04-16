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
const UND = artifacts.require("UnboundDollar");
const valuing = artifacts.require("Valuing_01");
const llcEth = artifacts.require("LLC_EthDai");
const llcLink = artifacts.require("LLC_LinkDai");
const testDai = artifacts.require("TestDai");
const testEth = artifacts.require("TestEth");
const testLink = artifacts.require("TestLink");
const uniFactory = artifacts.require("UniswapV2Factory");
const uniPair = artifacts.require("UniswapV2Pair");
const router = artifacts.require("UniswapV2Router02");
const testAggregatorEth = artifacts.require("TestAggregatorProxyEthUsd");
const testAggregatorLink = artifacts.require("TestAggregatorProxyLinkUsd");
const testAggregatorDai = artifacts.require("TestAggregatorProxyDaiUsd");

const Oracle = artifacts.require("UniswapV2PriceProvider");

contract("unboundSystem multiple LLC", function (_accounts) {
  // Initial settings
  const totalSupply = 0;
  const decimal = 10 ** 18;
  const owner = _accounts[0];
  const safu = _accounts[1];
  const devFund = _accounts[2];
  const user = _accounts[3];
  const daiAmount = 400000;
  const rateBalance = 10 ** 6;
  const rates = {
    eth: { loanRate: 500000, feeRate: 5000 },
    link: { loanRate: 600000, feeRate: 4000 },
  };
  const stakeSharesPercent = 50;
  const safuSharesPercent = 50;
  const CREnd = 20000;
  const CRNorm = 10000;
  const blockLimit = 10;
  const ethPrice = 128093000000;
  const daiPrice = 100275167;
  const linkPrice = 2311033776;
  const base = new BN("1000000000000000000");

  let und;
  let valueContract;
  let lockContractEth;
  let lockContractLink;
  let tDai;
  let tEth;
  let tLink;
  let factory;
  let pairEthDai;
  let pairLinkDai;
  let route;
  let storedFee = 0;
  let stakePair;

  before(async function () {
    tEth = await testEth.deployed();
    tLink = await testLink.deployed();
    tDai = await testDai.deployed();
    route = await router.deployed();
    und = await UND.deployed();
    valueContract = await valuing.deployed();
    lockContractEth = await llcEth.deployed();
    lockContractLink = await llcLink.deployed();
    factory = await uniFactory.deployed();
    pairEthDai = await uniPair.at(await lockContractEth.pair());
    pairLinkDai = await uniPair.at(await lockContractLink.pair());
    priceFeedEth = await testAggregatorEth.deployed();
    priceFeedLink = await testAggregatorLink.deployed();
    priceFeedDai = await testAggregatorDai.deployed();

    // Set price to aggregator
    await priceFeedEth.setPrice(ethPrice);
    await priceFeedLink.setPrice(linkPrice);
    await priceFeedDai.setPrice(daiPrice);

    let stakePool = await factory.createPair(tDai.address, und.address);
    stakePair = await uniPair.at(stakePool.logs[0].args.pair);
    await und.changeStaking(stakePair.address);

    // Ethereum
    await tDai.approve(route.address, daiAmount);
    await tEth.approve(route.address, parseInt((daiAmount * daiPrice) / ethPrice));
    let d = new Date();
    let time = d.getTime();
    await route.addLiquidity(
      tDai.address,
      tEth.address,
      daiAmount,
      parseInt((daiAmount * daiPrice) / ethPrice),
      3000,
      10,
      owner,
      parseInt(time / 1000 + 100)
    );

    // Link
    await tDai.approve(route.address, daiAmount);
    await tLink.approve(route.address, parseInt((daiAmount * daiPrice) / linkPrice));
    await route.addLiquidity(
      tDai.address,
      tLink.address,
      daiAmount,
      parseInt((daiAmount * daiPrice) / linkPrice),
      3000,
      10,
      owner,
      parseInt(time / 1000 + 100)
    );
  });

  //=================
  // Default Functionality
  //=================
  describe("Check default functionality", () => {
    it("UND mint - EthDai first", async () => {
      const lptBalanceBefore = await pairEthDai.balanceOf(owner);
      const LPtokens = lptBalanceBefore.div(new BN("4")); // Amount of token to be lock
      const lockedTokenBefore = parseInt(await lockContractEth.tokensLocked(owner));
      const undBalanceBefore = parseInt(await und.balanceOf(owner));
      const stakingBalanceBefore = parseInt(await und.balanceOf(stakePair.address));
      const LPTbal = parseInt(await pairEthDai.balanceOf(owner));
      const { loanAmount, feeAmount, stakingAmount } = await getAmounts(daiAmount, pairEthDai, LPtokens, rates.eth, ethPrice);

      await pairEthDai.approve(lockContractEth.address, LPtokens);
      const receipt = await lockContractEth.lockLPT(LPtokens, loanAmount - feeAmount);
      expectEvent.inTransaction(receipt.tx, und, "Mint", {
        user: owner,
        newMint: loanAmount.toString(),
      });

      const lptBalanceAfter = parseInt(await pairEthDai.balanceOf(owner));
      const lockedTokenAfter = parseInt(await lockContractEth.tokensLocked(owner));
      const undBalanceAfter = parseInt(await und.balanceOf(owner));
      const stakingBalanceAfter = parseInt(await und.balanceOf(stakePair.address));
      const loanedAmount = await und.checkLoan(owner, lockContractEth.address);

      assert.equal(lptBalanceAfter, lptBalanceBefore - LPtokens, "pool balance incorrect");
      assert.equal(lockedTokenAfter, lockedTokenBefore + LPtokens, "locked token incorrect");
      assert.equal(undBalanceAfter, undBalanceBefore + loanAmount - feeAmount, "owner balance incorrect");
      assert.equal(stakingBalanceAfter, stakingBalanceBefore + stakingAmount, "staking balance incorrect");
      assert.equal(loanedAmount.toString(), loanAmount.toString(), "loaned amount incorrect");
      storedFee += feeAmount - stakingAmount;

      console.log(`LLC-Eth.locked: ${await pairEthDai.balanceOf(lockContractEth.address)}`);
      console.log(`LLC-Link.locked: ${await pairLinkDai.balanceOf(lockContractLink.address)}`);
      console.log(`UND.balance: ${undBalanceAfter}`);
    });

    it("UND mint - LinkDai first", async () => {
      const lptBalanceBefore = await pairLinkDai.balanceOf(owner);
      const LPtokens = lptBalanceBefore.div(new BN("4")); // Amount of token to be lock
      const lockedTokenBefore = parseInt(await lockContractLink.tokensLocked(owner));
      const undBalanceBefore = await und.balanceOf(owner);
      const stakingBalanceBefore = parseInt(await und.balanceOf(stakePair.address));
      const { loanAmount, feeAmount, stakingAmount } = await getAmounts(daiAmount, pairLinkDai, LPtokens, rates.link, linkPrice);

      await pairLinkDai.approve(lockContractLink.address, LPtokens);
      const receipt = await lockContractLink.lockLPT(LPtokens, loanAmount.sub(feeAmount));
      expectEvent.inTransaction(receipt.tx, und, "Mint", {
        user: owner,
        newMint: loanAmount.toString(),
      });

      const lptBalanceAfter = parseInt(await pairLinkDai.balanceOf(owner));
      const lockedTokenAfter = parseInt(await lockContractLink.tokensLocked(owner));
      const undBalanceAfter = parseInt(await und.balanceOf(owner));
      const stakingBalanceAfter = parseInt(await und.balanceOf(stakePair.address));
      const loanedAmount = parseInt(await und.checkLoan(owner, lockContractLink.address));

      assert.equal(lptBalanceAfter, lptBalanceBefore - LPtokens, "pool balance incorrect");
      assert.equal(lockedTokenAfter, lockedTokenBefore + LPtokens, "locked token incorrect");
      assert.equal(undBalanceAfter.toString(), undBalanceBefore.add(loanAmount).sub(feeAmount).toString(), "owner balance incorrect");
      assert.equal(stakingBalanceAfter, stakingBalanceBefore + stakingAmount, "staking balance incorrect");
      assert.equal(loanedAmount.toString(), loanAmount.toString(), "loaned amount incorrect");
      storedFee += feeAmount - stakingAmount;

      console.log(`LLC-Eth.locked: ${await pairEthDai.balanceOf(lockContractEth.address)}`);
      console.log(`LLC-Link.locked: ${await pairLinkDai.balanceOf(lockContractLink.address)}`);
      console.log(`UND.balance: ${undBalanceAfter}`);
    });

    async function getAmounts(daiAmount, pair, LPtokens, rates, _price) {
      const reserves = await pair.getReserves();
    
      const ethPriceNormalized = (new BN(_price.toString())).mul(new BN("10000000000"));
      
      let ethReserve;
      let ethValue;
      if (reserves._reserve0.toString() === daiAmount.toString()) {
        ethReserve = new BN(reserves._reserve1.toString());
        ethValue = ethReserve.mul(ethPriceNormalized).div(base);
        
      } else {
        ethReserve = new BN(reserves._reserve0.toString());
        ethValue = ethReserve.mul(ethPriceNormalized).div(base);
      }
      

      const totalUSD = (new BN(daiAmount.toString())).add(ethValue); // Total value in Liquidity pool
      const totalLPTokens = await pair.totalSupply.call(); // Total token amount of Liq pool
      const priceOfLp = totalUSD.mul(base).div(totalLPTokens)

      const LPTValueInDai = (priceOfLp.mul(LPtokens)).div(base); //% value of Liq pool in Dai
      const loanRateBN = new BN(rates.loanRate.toString());
      const feeRateBN = new BN(rates.feeRate.toString());
      const rateBalanceBN = new BN(rateBalance.toString());
      const loanAmount = LPTValueInDai.mul(loanRateBN).div(rateBalanceBN); // Loan amount that user can get
      
      const feeAmount = (loanAmount.mul(feeRateBN).div(rateBalanceBN)); // Amount of fee
      const stakingAmount = 0;
      return { loanAmount, feeAmount, stakingAmount };
    }

    it("UND burn - EthDai", async () => {
      const lptBalanceBefore = parseInt(await pairEthDai.balanceOf(owner));
      const lockedTokenAmount = parseInt(await lockContractEth.tokensLocked(owner));
      const undBalanceBefore = parseInt(await und.balanceOf(owner));
      const mintedUND = parseInt(await und.checkLoan(owner, lockContractEth.address));

      // burn
      await helper.advanceBlockNumber(blockLimit);
      const receipt = await lockContractEth.unlockLPT(mintedUND);
      expectEvent.inTransaction(receipt.tx, und, "Burn", {
        user: owner,
        burned: mintedUND.toString(),
      });

      const lptBalanceAfter = parseInt(await pairEthDai.balanceOf(owner));
      const lockedTokenAfter = parseInt(await lockContractEth.tokensLocked(owner));
      const undBalanceAfter = parseInt(await und.balanceOf(owner));

      assert.equal(lptBalanceAfter, lptBalanceBefore + lockedTokenAmount, "pool balance incorrect");
      assert.equal(lockedTokenAfter, 0, "locked token incorrect");
      assert.equal(undBalanceAfter, undBalanceBefore - mintedUND, "owner balance incorrect");

      console.log(`LLC-Eth.locked: ${await pairEthDai.balanceOf(lockContractEth.address)}`);
      console.log(`LLC-Link.locked: ${await pairLinkDai.balanceOf(lockContractLink.address)}`);
      console.log(`UND.balance: ${undBalanceAfter}`);
    });

    it("cannot unlock with less than necessary amount of UND", async () => {
      // const lockedTokenAmount = parseInt(await lockContractLink.tokensLocked(owner));
      const mintedUND = parseInt(await und.checkLoan(owner, lockContractLink.address));

      // burn
      await expectRevert(lockContractLink.unlockLPT(mintedUND), "ERC20: burn amount exceeds balance");
    });

    it("UND burn - LinkDai", async () => {
      const oracleAddr = await lockContractLink.getOracle();
      const oracle = await Oracle.at(oracleAddr);

      const reserves = await pairLinkDai.getReserves();
    
      const ethPriceNormalized = (new BN(linkPrice.toString())).mul(new BN("10000000000"));
      
      
      let batReserve;
      let batValue;

      if (reserves._reserve0.toString() === daiAmount.toString()) {
        batReserve = new BN(reserves._reserve1.toString());
        batValue = batReserve.mul(ethPriceNormalized).div(base);
        
      } else {
        batReserve = new BN(reserves._reserve0.toString());
        batValue = batReserve.mul(ethPriceNormalized).div(base);
      }

      // console.log("batValue: ", batValue.toString());
      // console.log("daiValue: ", daiAmount);

      const totalUSD = (new BN(daiAmount.toString())).add(batValue);
      const totalLPTokens = await pairLinkDai.totalSupply(); // Total token amount of Liq pool
      const priceOfLp = totalUSD.mul(base).div(totalLPTokens)

      // console.log("price of LP: ", priceOfLp.toString());
      // end Addition

      // Unlock

      const lockedLPT = await lockContractLink.tokensLocked(owner);
      const valueStart = priceOfLp.mul(lockedLPT);

      const mintedUND = await und.checkLoan(owner, lockContractLink.address);
      const burnAmountUND = mintedUND.div(new BN("2"));
      const loanAfter = mintedUND.sub(burnAmountUND);
      
      const CREndBN = new BN(CREnd.toString());
      const CRNormBN = new BN(CRNorm.toString());
      const valueAfter = CREndBN.mul(loanAfter).div(CRNormBN);

      const unlockAmountLPT = valueStart.sub(valueAfter).div(priceOfLp);
      
      const tokenBalBefore = await und.balanceOf(owner);

      const lptBalanceBefore = parseInt(await pairLinkDai.balanceOf(owner));
      const lockedTokenAmount = parseInt(await lockContractLink.tokensLocked(owner));
      // const undBalanceBefore = parseInt(await und.balanceOf(owner));
      // const mintedUND = parseInt(await und.checkLoan(owner, lockContractLink.address));
      // const burnAmountUND = mintedUND / 2;
      // const priceLPT = parseInt(await oracle.latestAnswer());
      // console.log(priceLPT);
      // const unlockAmountLPT = lockedTokenAmount - ((mintedUND - burnAmountUND) * CREnd) / CRNorm / priceLPT;
      // const unlockAmountLPT = parseInt((lockedTokenAmount * burnAmountUND) / mintedUND);

      // burn
      await helper.advanceBlockNumber(blockLimit);
      const receipt = await lockContractLink.unlockLPT(burnAmountUND);
      expectEvent.inTransaction(receipt.tx, und, "Burn", {
        user: owner,
        burned: burnAmountUND.toString(),
      });
      const lptBalanceAfter = parseInt(await pairLinkDai.balanceOf(owner));
      const lockedTokenAmountAfter = parseInt(await lockContractLink.tokensLocked(owner));
      const undBalanceAfter = parseInt(await und.balanceOf(owner));

      assert.equal(lptBalanceAfter, lptBalanceBefore + parseInt(unlockAmountLPT), "pool balance incorrect");
      assert.equal(lockedTokenAmountAfter, lockedTokenAmount - parseInt(unlockAmountLPT), "locked token incorrect");
      assert.equal(undBalanceAfter, parseInt(tokenBalBefore) - parseInt(burnAmountUND), "owner balance incorrect");

      console.log(`LLC-Eth.locked: ${await pairEthDai.balanceOf(lockContractEth.address)}`);
      console.log(`LLC-Link.locked: ${await pairLinkDai.balanceOf(lockContractLink.address)}`);
      console.log(`UND.balance: ${undBalanceAfter}`);
    });
  });
});
