FROM ubuntu:14.04.5

RUN apt-get update && \
        apt-get install -y \
        software-properties-common \
        g++ \
        build-essential \
        curl \
        git \
        file \
        binutils \
        libssl-dev \
        pkg-config \
        libudev-dev \
        openssl

RUN curl -sL https://deb.nodesource.com/setup_8.x | sudo -E bash -
RUN apt-get install -y nodejs

ADD . /smart-contracts

WORKDIR /smart-contracts

RUN npm install -g truffle@4.0.1
RUN npm install bignumber.js
