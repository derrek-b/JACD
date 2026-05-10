// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import './JACDToken.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import './NFT.sol';

contract JACD {
    string public constant VERSION = "1.0.0";

    JACDToken public jacdToken;
    IERC20 public usdcToken;

    uint8 public maxProposalAmountPercent;
    uint256[] public holdersWeights;
    uint256 public holderVotes;
    uint256 public minHolderVotesToPass;
    uint256 public minVotesToFinalize;
    uint256 public holderVoteTime;
    uint256 public openVoteTime;

    NFT[] public collections;

    uint256 public jacdSupply;
    uint256 public usdcBalance;

    uint256 public proposalCount;
    mapping(uint256 => Proposal) public proposals;

    mapping(uint256 => mapping(address => bool)) public holderVoted;
    mapping(uint256 => mapping(address => bool)) public holderOpenVoted;

    enum VoteStage {Holder, Open, Finalized, Failed}

    struct Proposal {
        uint256 index;
        address recipient;
        uint256 amount;
        string name;
        string description;
        uint256 votesFor;
        uint256 votesAgainst;
        VoteStage stage;
        uint256 voteEnd;
    }

    event Deposit(
        address depositor,
        uint256 amount,
        uint256 timestamp
    );

    event Propose(
        uint256 index,
        address recipient,
        uint256 amount,
        string name,
        string description,
        address creator,
        uint256 timestamp
    );

    event Vote(
        uint256 proposal,
        address voter,
        VoteStage stage,
        bool voteFor,
        uint256 votes,
        uint256 timestamp
    );

    event VotePass(
        uint256 proposal,
        VoteStage stage,
        uint256 votesFor,
        uint256 votesAgainst
    );

    event FaucetClaim(
        address indexed claimer,
        uint256 collectionIdx,
        uint256 tokenId,
        uint256 usdcAmount
    );

    modifier holdersOrContributors {
        bool isHolderOrContributor;

        for(uint256 i; i < collections.length; i++) {
            if(collections[i].balanceOf(msg.sender) > 0) {
                isHolderOrContributor = true;
                break;
            }
        }

        if((!isHolderOrContributor) && jacdToken.balanceOf(msg.sender) > 0) {
            isHolderOrContributor = true;
        }

        require(isHolderOrContributor, 'JACD: not a holder or an contributor');

        _;
    }

    modifier onlyHolders {
        bool isHolder;

        for(uint256 i; i < collections.length; i++) {
            if(collections[i].balanceOf(msg.sender) > 0) {
                isHolder = true;
                break;
            }
        }

        require(isHolder, 'JACD: not a holder');
        _;
    }

    constructor(
        JACDToken _jacdToken,
        IERC20 _usdcToken,
        NFT[] memory _collections,
        uint8 _maxProposalAmountPercent,
        uint256[] memory _holdersWeights,
        uint256 _holderVotes,
        uint256 _minHolderVotesToPass,
        uint256 _minVotesToFinalize,
        uint256 _holderVoteTime,
        uint256 _openVoteTime
    )
    {
        require(_holdersWeights.length == _collections.length, 'JACD: weights/collections length mismatch');

        jacdToken = _jacdToken;
        usdcToken = _usdcToken;
        collections = _collections;
        maxProposalAmountPercent = _maxProposalAmountPercent;
        holdersWeights = _holdersWeights;
        holderVotes = _holderVotes;
        minHolderVotesToPass = _minHolderVotesToPass;
        minVotesToFinalize = _minVotesToFinalize;
        holderVoteTime = _holderVoteTime;
        openVoteTime = _openVoteTime;
    }

    function getCollections() public view returns (NFT[] memory) {
        return collections;
    }

    function getHoldersWeights() public view returns (uint256[] memory) {
        return holdersWeights;
    }

    function collectionsLength() public view returns (uint256) {
        return collections.length;
    }

    receive() external payable {}

    function receiveDeposit(uint256 _amount) public {
        require(_amount > 0, 'JACD: deposit amount of 0');
        require(
            usdcToken.transferFrom(msg.sender, address(this), _amount),
            'JACD: USDC transfer failed'
        );

        usdcBalance += _amount;

        distributeTokens(msg.sender, _amount);

        emit Deposit(msg.sender, _amount, block.timestamp);
    }

    function distributeTokens(address _depositer, uint256 _amount) private {
        uint256 formattedAmount = _amount * 10**12;

        require(
            jacdToken.mint(_depositer, formattedAmount),
            'JACD: distribution of JACD tokens failed'
        );

        jacdSupply += formattedAmount;
    }

    function createProposal(
        address _recipient,
        uint256 _amount,
        string memory _name,
        string memory _description
    )
        public
        holdersOrContributors
    {
        uint256 maxAmount = (maxProposalAmountPercent * usdcBalance) / 100;

        require(_amount > 0, 'JACD: proposal amount of 0');
        require(_amount <= maxAmount, 'JACD: proposal exceeds limit');
        require(bytes(_name).length > 0, 'JACD: no proposal name');
        require(bytes(_description).length > 0, 'JACD: no proposal description');
        require(_recipient != address(0), 'JACD: invalid proposal recipient address');

        proposalCount++;

        Proposal memory proposal;
        proposal.index = proposalCount;
        proposal.recipient = _recipient;
        proposal.amount = _amount;
        proposal.name = _name;
        proposal.description = _description;
        proposal.votesFor = 0;
        proposal.votesAgainst = 0;
        proposal.stage = VoteStage.Holder;
        proposal.voteEnd = block.timestamp + holderVoteTime;

        proposals[proposalCount] = proposal;

        emit Propose(proposalCount,
            _recipient,
            _amount,
            _name,
            _description,
            msg.sender,
            block.timestamp
        );
    }

    function holdersVote(uint256 _index, bool _voteFor) public onlyHolders {
        Proposal storage proposal = proposals[_index];

        require(proposal.stage == VoteStage.Holder, 'JACD: not in "holder" voting stage');
        require(!holderVoted[_index][msg.sender], 'JACD: holder already voted');
        require(proposal.voteEnd > block.timestamp, 'JACD: holder voting expired');

        uint256 votes;

        for(uint256 i; i < collections.length; i++) {
            votes += collections[i].balanceOf(msg.sender);
        }

        if (_voteFor) {
            proposal.votesFor += votes;
        } else {
            proposal.votesAgainst += votes;
        }

        holderVoted[_index][msg.sender] = true;

        emit Vote(_index, msg.sender, proposal.stage, _voteFor, votes, block.timestamp);
    }

    function finalizeHoldersVote(uint256 _index) public onlyHolders {
        Proposal storage proposal = proposals[_index];

        require(proposal.stage == VoteStage.Holder, 'JACD: not in "holder" voting stage');

        uint256 votesSubmitted = proposal.votesFor + proposal.votesAgainst;

        require(
            block.timestamp > proposal.voteEnd ||
            votesSubmitted == holderVotes,
            'JACD: vote has not ended'
        );

        if (
            votesSubmitted >= minHolderVotesToPass &&
            proposal.votesFor > proposal.votesAgainst
        ) {
            emit VotePass(
                proposal.index,
                proposal.stage,
                proposal.votesFor,
                proposal.votesAgainst
            );

            proposal.stage = VoteStage.Open;
            proposal.votesFor = 0;
            proposal.votesAgainst = 0;
            proposal.voteEnd = block.timestamp + openVoteTime;
        } else {
            proposal.stage = VoteStage.Failed;
        }
    }

    function openVote(uint256 _index, bool _voteFor, uint256 _tokenVotes) public holdersOrContributors {
        Proposal storage proposal = proposals[_index];

        require(proposal.stage == VoteStage.Open, 'JACD: not in "open" voting stage ');
        require(
            (!holderOpenVoted[_index][msg.sender]) ||
            jacdToken.balanceOf(msg.sender) > 0,
            'JACD: no votes/already voted'
        );
        require(jacdToken.balanceOf(msg.sender) >= _tokenVotes, 'JACD: insufficient JACD token votes');
        require(block.timestamp < proposal.voteEnd, 'JACD: voting time expired');

        uint256 allVotes = _tokenVotes;

        if(!holderOpenVoted[_index][msg.sender]) {
            for(uint256 i; i < collections.length; i++) {
                allVotes += collections[i].balanceOf(msg.sender) * (holdersWeights[i] * 1e18);
            }
        }

        if (_voteFor) {
            proposal.votesFor += allVotes;
        } else {
            proposal.votesAgainst += allVotes;
        }

        if (allVotes > _tokenVotes) {
            holderOpenVoted[_index][msg.sender] = true;
        }

        if(_tokenVotes > 0) {
            jacdToken.burnFrom(msg.sender, _tokenVotes);
        }

        emit Vote(_index, msg.sender, proposal.stage, _voteFor, allVotes, block.timestamp);
    }

    function finalizeProposal(uint256 _index) public onlyHolders {
        Proposal storage proposal = proposals[_index];

        require(block.timestamp > proposal.voteEnd, 'JACD: vote has not ended');
        require(
            usdcToken.balanceOf(address(this)) > proposal.amount,
            'JACD: insufficient USDC balance'
        );

        if(
            proposal.votesFor > proposal.votesAgainst &&
            proposal.votesFor + proposal.votesAgainst >= minVotesToFinalize
        ) {
            require(usdcToken.transfer(proposal.recipient, proposal.amount));
            usdcBalance -= proposal.amount;

            emit VotePass(
                proposal.index,
                proposal.stage,
                proposal.votesFor,
                proposal.votesAgainst
            );

            proposal.stage = VoteStage.Finalized;
        } else {
            proposal.stage = VoteStage.Failed;
        }
    }

    // Setter functions are for a future governance upgrade
    // function setMaxProposalAmountPercent(uint8 _percent) private {
    //     require(_percent > 0, 'JACD: new max prop amt percent 0');
    //     require(_percent <= 100, 'JACD: new max prop amt percent > 100');

    //     maxProposalAmountPercent = _percent;
    // }

    // function setHoldersWeights(uint256[] memory _weights) private {
    //     require(_weights.length == collections.length, 'JACD: weights/collections length mismatch');

    //     holdersWeights = _weights;
    // }

    // function setMinHolderVotesToPass(uint256 _minHolderVotes) private {
    //     require(_minHolderVotes > 0, 'JACD: new minimum holder votes 0');

    //     minHolderVotesToPass = _minHolderVotes;
    // }

    // function setMinVotesToFinalize(uint256 _minVotes) private {
    //     require(_minVotes > 0, 'JACD: new minimum votes 0');

    //     minHolderVotesToPass = _minVotes;
    // }

    // function setHolderVoteTime(uint256 _time) private {
    //     require(_time > 0, 'JACD: new holder vote time 0');

    //     holderVoteTime = _time;
    // }

    // function setOpenVoteTime(uint256 _time) private {
    //     require(_time > 0, 'JACD: new open vote time 0');

    //     openVoteTime = _time;
    // }

    function faucetRequest(address _from) external {
        require(_from != address(0), 'JACD: invalid faucet sender address');

        int256 requestAmount = (100 * 10**6) - int256(usdcToken.balanceOf(msg.sender));
        require(requestAmount <= int256(usdcToken.balanceOf(_from)), 'JACD: not enough remaining USDC for faucet');

        uint256 usdcTransferred = 0;
        if(requestAmount > 0) {
            usdcToken.transferFrom(_from, msg.sender, uint256(requestAmount));
            usdcTransferred = uint256(requestAmount);
        }

        uint256 idx = uint256(keccak256(abi.encodePacked(block.prevrandao, msg.sender))) % collections.length;
        NFT picked = collections[idx];

        uint256 transferredTokenId = 0;
        if(picked.balanceOf(msg.sender) == 0) {
            uint256[] memory tokenIds = picked.walletOfOwner(_from);
            if(tokenIds.length > 0) {
                picked.transferFrom(_from, msg.sender, tokenIds[0]);
                transferredTokenId = tokenIds[0];
            }
        }

        emit FaucetClaim(msg.sender, idx, transferredTokenId, usdcTransferred);
    }
}
