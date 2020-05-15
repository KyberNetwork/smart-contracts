pragma solidity 0.4.18;

import "./TokenReceiver.sol";
import "./libs/DemurrageStructs.sol";
import "./libs/TransferStructs.sol";
import "./libs/Types.sol";
import "./libs/MathUtils.sol";


contract DummyDGXStorage {
    using Types for Types.MutableUint;
    using Types for Types.MutableTimestamp;

    struct FeeConfiguration {
        uint256 base;
        uint256 rate;
    }

    struct GlobalConfig {
        bytes32 current_version;
        bool no_demurrage_fee;
        bool no_transfer_fee;
        uint256 minimum_transfer_amount;
        Fees fees;
    }

    struct Fees {
        FeeConfiguration demurrage;
        FeeConfiguration transfer;
    }

    struct Collectors {
        address demurrage;
        address transfer;
    }

    struct UserConfig {
        bool no_demurrage_fee;
        bool no_transfer_fee;
    }

    struct UserData {
        uint256 last_payment_date;
        uint256 raw_balance;
        mapping(address => uint256) spender_allowances;
    }

    struct User {
        UserConfig config;
        UserData data;
    }

    struct System {
        Collectors collectors;
        GlobalConfig config;
        uint256 total_supply;
        mapping(address => User) users;
    }

    System system;
    address ROOT;
    address DGX_INTERACTIVE_ADDRESS;

    function DummyDGXStorage() public {
        address _demurrage_collector;
        address _transfer_collector;
        assembly {
            _demurrage_collector := create(0, 0, 0)
            _transfer_collector := create(0, 0, 0)
        }

        system.config.fees.demurrage.base = 10000000;
        system.config.fees.demurrage.rate = 165;
        system.config.fees.transfer.base = 10000;
        system.config.fees.transfer.rate = 13;
        system.config.minimum_transfer_amount = 1000000;
        system.config.no_demurrage_fee = false;
        system.config.no_transfer_fee = false;
        system.config.current_version = "1.0.0";
        system.total_supply = 0;
        ROOT = msg.sender;
    }

    function setInteractive(address _DummyDGXInteractive) public if_root() {
        DGX_INTERACTIVE_ADDRESS = _DummyDGXInteractive;
    }

    modifier if_root() {
        require(msg.sender == ROOT);
        _;
    }

    modifier if_dgx_interactive() {
        require(msg.sender == DGX_INTERACTIVE_ADDRESS);
        _;
    }

    /////////////////////////////// PUBLIC FUNCTIONS ////////////////////////////

    function read_demurrage_config()
        public
        constant
        returns (uint256 _collector_balance, uint256 _base, uint256 _rate, address _collector)
    {
        _collector_balance = system.users[system.collectors.demurrage].data.raw_balance;
        bool _global_demurrage_disabled = system.config.no_demurrage_fee;
        _collector = system.collectors.demurrage;
        if (_global_demurrage_disabled) {
            _base = 0;
            _rate = 0;
        } else {
            _base = system.config.fees.demurrage.base;
            _rate = system.config.fees.demurrage.rate;
        }
    }

    function read_demurrage_config_underlying()
        public
        constant
        returns (uint256 _base, uint256 _rate, address _collector, bool _no_demurrage_fee)
    {
        _base = system.config.fees.demurrage.base;
        _rate = system.config.fees.demurrage.rate;
        _collector = system.collectors.demurrage;
        _no_demurrage_fee = system.config.no_demurrage_fee;
    }

    function read_transfer_config()
        public
        constant
        returns (
            uint256 _collector_balance,
            uint256 _base,
            uint256 _rate,
            address _collector,
            bool _no_transfer_fee,
            uint256 _minimum_transfer_amount
        )
    {
        _collector_balance = system.users[system.collectors.transfer].data.raw_balance;
        _base = system.config.fees.transfer.base;
        _rate = system.config.fees.transfer.rate;
        _collector = system.collectors.transfer;
        _no_transfer_fee = system.config.no_transfer_fee;
        _minimum_transfer_amount = system.config.minimum_transfer_amount;
    }

    function read_user_for_transfer(address _account)
        public
        constant
        returns (uint256 _raw_balance, bool _no_transfer_fee)
    {
        _raw_balance = system.users[_account].data.raw_balance;
        _no_transfer_fee = system.users[_account].config.no_transfer_fee;
    }

    function read_user_for_demurrage(address _account)
        public
        constant
        returns (uint256 _raw_balance, uint256 _payment_date, bool _no_demurrage_fee)
    {
        _raw_balance = system.users[_account].data.raw_balance;
        _payment_date = system.users[_account].data.last_payment_date;
        _no_demurrage_fee =
            system.users[_account].config.no_demurrage_fee ||
            system.config.no_demurrage_fee;
    }

    function read_total_supply() public constant returns (uint256 _totalSupply) {
        _totalSupply = system.total_supply;
    }

    function read_allowance(address _owner, address _spender)
        public
        constant
        returns (uint256 _allowance)
    {
        _allowance = system.users[_owner].data.spender_allowances[_spender];
    }

    function read_user_fees_configs(address _account)
        public
        constant
        returns (bool _no_demurrage_fee, bool _no_transfer_fee)
    {
        _no_demurrage_fee = system.users[_account].config.no_demurrage_fee;
        _no_transfer_fee = system.users[_account].config.no_transfer_fee;
    }

    ////////////////////////// CALLABLE FROM INTERACTIVE ////////////////////////

    function show_demurraged_balance(address _user)
        public
        constant
        if_dgx_interactive()
        returns (uint256 _actual_balance)
    {
        DemurrageStructs.Demurrage memory _demurrage = get_demurraged_data(_user);
        _demurrage = calculate_demurrage(_demurrage);
        _actual_balance = _demurrage.user.balance.post;
    }

    function put_transfer(
        address _sender,
        address _recipient,
        address _spender,
        uint256 _amount,
        bool _transfer_from
    ) public if_dgx_interactive() returns (bool _success) {
        require(_sender != _recipient);
        require(deduct_demurrage(_sender) == true);
        require(deduct_demurrage(_recipient) == true);

        TransferStructs.Transfer memory _transfer;
        (
            _transfer.config.collector_balance.pre,
            _transfer.config.base,
            _transfer.config.rate,
            _transfer.config.collector,
            _transfer.config.global_transfer_fee_disabled,
            _transfer.config.minimum_transfer_amount
        ) = read_transfer_config();

        require(_amount >= _transfer.config.minimum_transfer_amount);

        (_transfer.sender.balance.pre, _transfer.sender.no_transfer_fee) = read_user_for_transfer(
            _sender
        );

        (
            _transfer.recipient.balance.pre,
            _transfer.recipient.no_transfer_fee
        ) = read_user_for_transfer(_recipient);

        _transfer.sent_amount = _amount;
        _transfer.is_transfer_from = _transfer_from;

        if (
            (_transfer.config.global_transfer_fee_disabled == true) ||
            (_transfer.sender.no_transfer_fee == true)
        ) {
            _transfer = build_transfer_with_no_transfer_fee(_transfer);
        } else {
            _transfer = build_transfer_with_transfer_fee(_transfer);
        }

        if (_transfer.is_transfer_from == true) {
            require(deduct_demurrage(_spender) == true);
            _transfer.spender.allowance.pre = read_allowance(_sender, _spender);
            _transfer.spender.allowance = _transfer.spender.allowance.subtract(_amount);

            _success = update_transfer_from_balance(
                _sender,
                _transfer.sender.balance.post,
                _recipient,
                _transfer.recipient.balance.post,
                _transfer.config.collector_balance.post,
                _spender,
                _transfer.spender.allowance.post
            );
        } else {
            _success = update_transfer_balance(
                _sender,
                _transfer.sender.balance.post,
                _recipient,
                _transfer.recipient.balance.post,
                _transfer.config.collector_balance.post
            );
        }
        require(_success);
    }

    function put_approve(address _account, address _spender, uint256 _amount)
        public
        if_dgx_interactive()
        returns (bool _success)
    {
        Types.MutableUint memory _a;

        _a.pre = read_allowance(_account, _spender);

        if ((_a.pre > 0) && (_amount > 0)) {
            revert();
        } else {
            _a.post = _amount;
            _success = update_account_spender_allowance(_account, _spender, _a.post);
        }
    }

    function update_user_fees_configs(address _user, bool _no_demurrage_fee, bool _no_transfer_fee)
        public
        if_dgx_interactive()
        returns (bool _success)
    {
        system.users[_user].config.no_demurrage_fee = _no_demurrage_fee;
        system.users[_user].config.no_transfer_fee = _no_transfer_fee;
        _success = true;
    }

    // This function is not present in the DummyDGX2.0 token contracts.
    // For test purpose, only used to bypass the POP process
    function mint_dgx_for(address _for, uint256 _amount)
        public
        if_dgx_interactive()
        returns (bool _success)
    {
        system.users[_for].data.raw_balance += _amount;
        system.total_supply += _amount;
        _success = true;
    }

    // This function is not present in the DummyDGX2.0 token contracts.
    // For test purpose, only used to simulate demurrage deduction
    function modify_last_payment_date(address _of, uint256 _byMinutes)
        public
        if_dgx_interactive()
        returns (bool _success)
    {
        system.users[_of].data.last_payment_date = now - (_byMinutes * 1 minutes);
        _success = true;
    }

    //////////////////////////// PRIVATE FUNCTIONS //////////////////////////////

    function get_demurraged_data(address _user)
        private
        constant
        returns (DemurrageStructs.Demurrage _demurrage)
    {
        (
            _demurrage.config.collector_balance.pre,
            _demurrage.config.base,
            _demurrage.config.rate,
            _demurrage.config.collector
        ) = read_demurrage_config();
        _demurrage.user.account = _user;
        (
            _demurrage.user.balance.pre,
            _demurrage.user.payment_date.time.pre,
            _demurrage.user.no_demurrage_fee
        ) = read_user_for_demurrage(_user);
    }

    function calculate_demurrage(DemurrageStructs.Demurrage memory _demurrage)
        private
        constant
        returns (DemurrageStructs.Demurrage _calculated)
    {
        if (_demurrage.user.payment_date.time.pre == 0) {
            _demurrage.user.payment_date.time.pre = now;
        }
        // demurrage collector is never deducted for demurrage
        if (
            _demurrage.user.no_demurrage_fee == true ||
            _demurrage.user.account == _demurrage.config.collector
        ) {
            _demurrage.user.balance.post = _demurrage.user.balance.pre;
            _demurrage.config.collector_balance.post = _demurrage.config.collector_balance.pre;
            _demurrage.user.payment_date.time.post = now;
        } else {
            _demurrage.user.payment_date = _demurrage.user.payment_date.advance_by(1 days);
            if (_demurrage.user.payment_date.in_units == 0) {
                _demurrage.user.balance.post = _demurrage.user.balance.pre;
                _demurrage.config.collector_balance.post = _demurrage.config.collector_balance.pre;
            } else {
                _demurrage.collected_fee =
                    (_demurrage.user.payment_date.in_units *
                        _demurrage.user.balance.pre *
                        _demurrage.config.rate) /
                    _demurrage.config.base;
                _demurrage.user.balance = _demurrage.user.balance.subtract(
                    _demurrage.collected_fee
                );
                _demurrage.config.collector_balance = _demurrage.config.collector_balance.add(
                    _demurrage.collected_fee
                );
            }
        }
        _calculated = _demurrage;
    }

    function deduct_demurrage(address _user) public returns (bool _success) {
        DemurrageStructs.Demurrage memory _demurrage = get_demurraged_data(_user);
        _demurrage = calculate_demurrage(_demurrage);
        update_user_for_demurrage(
            _demurrage.user.account,
            _demurrage.user.balance.post,
            _demurrage.user.payment_date.time.post,
            _demurrage.config.collector_balance.post
        );
        _success = true;
    }

    function update_user_for_demurrage(
        address _user,
        uint256 _user_new_balance,
        uint256 _user_new_payment_date,
        uint256 _collector_new_balance
    ) private {
        system.users[system.collectors.demurrage].data.raw_balance = _collector_new_balance;
        system.users[_user].data.raw_balance = _user_new_balance;
        system.users[_user].data.last_payment_date = _user_new_payment_date;
    }

    function build_transfer_with_no_transfer_fee(TransferStructs.Transfer memory _transfer)
        private
        pure
        returns (TransferStructs.Transfer memory _built)
    {
        _transfer.fee = 0;
        _transfer.received_amount = _transfer.received_amount.add(_transfer.sent_amount);
        _transfer.sender.balance = _transfer.sender.balance.subtract(
            _transfer.received_amount.post
        );
        _transfer.config.collector_balance.post = _transfer.config.collector_balance.pre;
        _transfer.recipient.balance = _transfer.recipient.balance.add(
            _transfer.received_amount.post
        );
        _built = _transfer;
    }

    function build_transfer_with_transfer_fee(TransferStructs.Transfer memory _transfer)
        private
        pure
        returns (TransferStructs.Transfer memory _built)
    {
        _transfer.fee = (_transfer.sent_amount * _transfer.config.rate) / _transfer.config.base;
        _transfer.received_amount.pre = _transfer.sent_amount;
        _transfer.received_amount = _transfer.received_amount.subtract(_transfer.fee);
        _transfer.config.collector_balance = _transfer.config.collector_balance.add(_transfer.fee);
        _transfer.sender.balance = _transfer.sender.balance.subtract(_transfer.sent_amount);
        _transfer.recipient.balance = _transfer.recipient.balance.add(
            _transfer.received_amount.post
        );
        _built = _transfer;
    }

    function update_account_spender_allowance(
        address _account,
        address _spender,
        uint256 _new_allowance
    ) private returns (bool _success) {
        system.users[_account].data.spender_allowances[_spender] = _new_allowance;
        _success = true;
    }

    function update_transfer_balance(
        address _sender,
        uint256 _sender_new_balance,
        address _recipient,
        uint256 _recipient_new_balance,
        uint256 _transfer_fee_collector_new_balance
    ) private returns (bool _success) {
        system.users[_sender].data.raw_balance = _sender_new_balance;
        system.users[_recipient].data.raw_balance = _recipient_new_balance;
        system.users[system.collectors.transfer]
            .data
            .raw_balance = _transfer_fee_collector_new_balance;
        _success = true;
    }

    function update_transfer_from_balance(
        address _sender,
        uint256 _sender_new_balance,
        address _recipient,
        uint256 _recipient_new_balance,
        uint256 _transfer_fee_collector_new_balance,
        address _spender,
        uint256 _spender_new_allowance
    ) private returns (bool _success) {
        system.users[_sender].data.raw_balance = _sender_new_balance;
        system.users[_recipient].data.raw_balance = _recipient_new_balance;
        system.users[system.collectors.transfer]
            .data
            .raw_balance = _transfer_fee_collector_new_balance;
        system.users[_sender].data.spender_allowances[_spender] = _spender_new_allowance;
        _success = true;
    }
}
