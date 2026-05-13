// Toolbox 1.0.2 transitively pulls @nomiclabs/hardhat-etherscan, which
// conflicts with the modern @nomicfoundation/hardhat-verify on the `verify`
// task (HH210). Inline the toolbox's individual plugins (skipping
// hardhat-etherscan) so we can use hardhat-verify, which uses the current
// binaries.soliditylang.org URL instead of the deprecated
// solc-bin.ethereum.org one.
require("@nomicfoundation/hardhat-chai-matchers");
require("@nomicfoundation/hardhat-network-helpers");
require("@nomiclabs/hardhat-ethers");
require("@typechain/hardhat");
require("hardhat-gas-reporter");
require("solidity-coverage");
require("@nomicfoundation/hardhat-verify");
require('dotenv').config()

const privateKeys = process.env.PRIVATE_KEYS || ""

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.18",
  networks: {
    hardhat: {
    },
    sepolia: {
      url: `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts: privateKeys.split(','),
    }
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY
  }
};
