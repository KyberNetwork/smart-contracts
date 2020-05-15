pragma solidity 0.4.18;

import "./DummyDGXStorage.sol";


contract DummyDGX {
    address DGX_STORAGE_ADDRESS;
    address FEES_ADMIN;

    string public constant name = "Dummy Digix Gold Token";
    string public constant symbol = "DummyDGX";
    uint8 public constant decimals = 9;

    function DummyDGX(address _dummyDGXStorage, address _feesAdmin) public {
        DGX_STORAGE_ADDRESS = _dummyDGXStorage;
        FEES_ADMIN = _feesAdmin;
    }

    modifier if_fees_admin() {
        require(msg.sender == FEES_ADMIN);
        _;
    }

    function totalSupply() public constant returns (uint256 _totalSupply) {
        _totalSupply = DummyDGXStorage(DGX_STORAGE_ADDRESS).read_total_supply();
    }

    function balanceOf(address _owner) public constant returns (uint256 _balance) {
        _balance = DummyDGXStorage(DGX_STORAGE_ADDRESS).show_demurraged_balance(_owner);
    }

    function transfer(address _to, uint256 _value) public returns (bool _success) {
        _success = DummyDGXStorage(DGX_STORAGE_ADDRESS).put_transfer(
            msg.sender,
            _to,
            0x0,
            _value,
            false
        );
    }

    function transferFrom(address _from, address _to, uint256 _value)
        public
        returns (bool _success)
    {
        _success = DummyDGXStorage(DGX_STORAGE_ADDRESS).put_transfer(
            _from,
            _to,
            msg.sender,
            _value,
            true
        );
    }

    function transferAndCall(address _receiver, uint256 _amount, bytes32 _data)
        public
        returns (bool _success)
    {
        transfer(_receiver, _amount);
        _success = TokenReceiver(_receiver).tokenFallback(msg.sender, _amount, _data);
        require(_success);
    }

    function approve(address _spender, uint256 _value) public returns (bool _success) {
        _success = DummyDGXStorage(DGX_STORAGE_ADDRESS).put_approve(msg.sender, _spender, _value);
    }

    function allowance(address _owner, address _spender)
        public
        constant
        returns (uint256 _allowance)
    {
        _allowance = DummyDGXStorage(DGX_STORAGE_ADDRESS).read_allowance(_owner, _spender);
    }

    function updateUserFeesConfigs(address _user, bool _no_demurrage_fee, bool _no_transfer_fee)
        public
        if_fees_admin()
        returns (bool _success)
    {
        _success = DummyDGXStorage(DGX_STORAGE_ADDRESS).update_user_fees_configs(
            _user,
            _no_demurrage_fee,
            _no_transfer_fee
        );
    }

    function showDemurrageConfigs()
        public
        constant
        returns (uint256 _base, uint256 _rate, address _collector, bool _no_demurrage_fee)
    {
        (_base, _rate, _collector, _no_demurrage_fee) = DummyDGXStorage(DGX_STORAGE_ADDRESS)
            .read_demurrage_config_underlying();
    }

    ////////////////////////////// MOCK FUNCTIONS ///////////////////////////////

    // This function is not present in the DGX2.0 token contracts.
    // For test purpose, only used to bypass the POP process
    function mintDgxFor(address _for, uint256 _amount) public returns (bool _success) {
        _success = DummyDGXStorage(DGX_STORAGE_ADDRESS).mint_dgx_for(_for, _amount);
    }

    // This function is not present in the DGX2.0 token contracts.
    // For test purpose, only used to simulate demurrage deduction
    function modifyLastPaymentDate(address _of, uint256 _byMinutes)
        public
        returns (bool _success)
    {
        _success = DummyDGXStorage(DGX_STORAGE_ADDRESS).modify_last_payment_date(_of, _byMinutes);
    }
}
