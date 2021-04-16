FROM ubuntu:18.04

RUN apt update
RUN apt -qq update
RUN apt install -y curl git
RUN curl -sL https://deb.nodesource.com/setup_10.x | bash
RUN apt install -y nodejs
VOLUME ["/data"]
ADD . /data
RUN cd /data && npm install
RUN npm install truffle

# docker exec -it firefly bash
# cd data
# npm install -g truffle
# apt-get update
# apt install -y ./firefly_amd64_bionic.deb
# firefly compile
# firefly launch -p 8545 &
# firefly test