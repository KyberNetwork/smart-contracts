pragma solidity 0.4.18;

contract testBytes32 {

    uint numTests;
    bytes public localHint;

    function testBytes32(bytes) public{
        localHint[0] = byte(80);
        localHint[1] = byte(69);
        localHint[2] = byte(82);
        localHint[3] = byte(77);
    }

    event TestBytes(bytes sentHint, bytes localHint);
    function testBytes(bytes hint) public {
        ++numTests;
        TestBytes(hint, localHint);
    }
}
