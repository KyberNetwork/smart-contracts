pragma solidity 0.5.11;


interface IERC20 {
    function transfer(address _to, uint256 _value)
        external
        returns (bool success);

    function transferFrom(
        address _from,
        address _to,
        uint256 _value
    ) external returns (bool success);

    function approve(address _spender, uint256 _value)
        external
        returns (bool success);

    function totalSupply() external view returns (uint256 supply);

    function balanceOf(address _owner) external view returns (uint256 balance);

    function allowance(address _owner, address _spender)
        external
        view
        returns (uint256 remaining);

    function decimals() external view returns (uint256 digits);

    event Approval(
        address indexed _owner,
        address indexed _spender,
        uint256 _value
    );
}


// to support backward compatible contract name -- so function signature remains same
contract ERC20 is IERC20 {

}
