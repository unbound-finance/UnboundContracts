const uDai = artifacts.require('UnboundDollar');
const valuing = artifacts.require('Valuing_01');

module.exports = async (deployer, network, accounts) => {
  await deployer.deploy(valuing);
};
