const uDai = artifacts.require("UnboundDollar");
const valuing = artifacts.require("Valuing_01");

const LLC = artifacts.require("LLC_EthDai");

module.exports = async (deployer, network, accounts) => {
  
  let unbound, valuer, factory, tEth, tDai, route;

  let LPT = "Liquidity-Pool-Token-ADDRESS-HERE"
  let stablecoin = "Stablecoin-ADDRESS-HERE"

  deployer.deploy(uDai, "Unbound Dollar", "UND", placeHoldAddr, placeHoldAddr).then((instance) => {
    unbound = instance.address;
    UBD = instance;
    return deployer.deploy(valuing, unbound).then((ins) => {
      valuer = ins.address;
      return deployer.deploy(LLC, valuer, LPT, stablecoin, unbound).then( async (resu) => {
        unbound = await uDai.deployed();
        valuer = await valuing.deployed();
        let permissionLLC = await valuer.addLLC.sendTransaction(
          resu.address,
          loanRate,
          feeRate
        );
        let permissionUdai = await valuer.allowToken.sendTransaction(
          unbound.address
        );
  
        let newValuator = await unbound.changeValuator.sendTransaction(
          valuer.address
        );
      });  
    })
  });
};

// });

// let valuing = await deployer.deploy(valuing, "0x276673170227Ed4f09d6b9f4Ba9b8F4777d99762", unbound.address());

// deployer.deploy(LLC, valuing.address(), "0x1443398Aa8E16E0F289B12ddCf666eeC4215bF46");
// // deployer.deploy(testDai, "0x464499A3D0a578448f4F4B6e223A97497cFDB8d6");
// // deployer.deploy(testEth, "0x464499A3D0a578448f4F4B6e223A97497cFDB8d6");

// deployer.deploy(LPTstake, "0x6BdC51c8017ABe83CB45Dc20a4d4A1060861021c" ,feeSplit.address(), unbound.address(), "0x5124d2A8e3A02f906d86803D703FD6CcCf492EF8", "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D");
