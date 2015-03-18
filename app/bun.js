(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var dataPath = '/Users/vaso/htdocs/node/4.smotrach/app/';
var torrentFile = dataPath + 'tor/forever.torrent';

    console.debug(0);
var WebTorrent = require('webtorrent');
var fs = require('fs');

var client = new WebTorrent();
var torrentFile = 'magnet:?xt=urn:btih:f41ca326f8d27a2dd50b048fd6a269e55a3a1634&dn=Forever.S01E01.1080p.rus.LostFilm.TV.mkv&tr=http%3A%2F%2Fbt6.tracktor.in%2Ftracker.php%2Fe2ea4e2fc45d49f5ce0fc0cabcfafca9%2Fannounce';
var torrentFile = '/Users/vaso/htdocs/node/4.smotrach/app/tor/forever.torrent';
client.add(torrentFile, {
    tmp: dataPath + 'tor/tmp'
}, function (torrent) {console.debug(2);
    // Got torrent metadata!
    console.log('Torrent info hash:', torrent.infoHash)
    console.log('Magnet:', torrent.magnetURI)


    /*    torrent.files.forEach(function (file) {
     // Stream each file to the disk
     var source = file.createReadStream()
     var destination = fs.createWriteStream(dataPath + 'tor/' + file.name);
     console.log(file.name)
     source.pipe(destination)
     })*/
});



},{"fs":69,"webtorrent":2}],2:[function(require,module,exports){
(function (process,Buffer){
// TODO: dhtPort and torrentPort should be consistent between restarts
// TODO: peerId and nodeId should be consistent between restarts

module.exports = WebTorrent

var createTorrent = require('create-torrent')
var debug = require('debug')('webtorrent')
var DHT = require('bittorrent-dht/client') // browser exclude
var EventEmitter = require('events').EventEmitter
var extend = require('xtend')
var hat = require('hat')
var inherits = require('inherits')
var loadIPSet = require('load-ip-set') // browser exclude
var parallel = require('run-parallel')
var parseTorrent = require('parse-torrent')
var speedometer = require('speedometer')
var zeroFill = require('zero-fill')

var FSStorage = require('./lib/fs-storage') // browser exclude
var Storage = require('./lib/storage')
var Torrent = require('./lib/torrent')

inherits(WebTorrent, EventEmitter)

/**
 * BitTorrent client version string (used in peer ID).
 * Generated from package.json major and minor version. For example:
 *   '0.16.1' -> '0016'
 *   '1.2.5' -> '0102'
 */
var VERSION = (require('./package.json').version || '0.0.1')
  .match(/([0-9]+)/g).slice(0, 2).map(zeroFill(2)).join('')

/**
 * WebTorrent Client
 * @param {Object} opts
 */
function WebTorrent (opts) {
  var self = this
  if (!(self instanceof WebTorrent)) return new WebTorrent(opts)
  if (!opts) opts = {}
  EventEmitter.call(self)
  if (!debug.enabled) self.setMaxListeners(0)

  self.destroyed = false
  self.torrentPort = opts.torrentPort || 0
  self.tracker = opts.tracker !== undefined ? opts.tracker : true
  self.rtcConfig = opts.rtcConfig

  self.torrents = []

  self.downloadSpeed = speedometer()
  self.uploadSpeed = speedometer()

  self.storage = typeof opts.storage === 'function'
    ? opts.storage
    : (opts.storage !== false && typeof FSStorage === 'function' /* browser exclude */)
      ? FSStorage
      : Storage

  self.peerId = opts.peerId === undefined
    ? new Buffer('-WW' + VERSION + '-' + hat(48), 'utf8')
    : typeof opts.peerId === 'string'
      ? new Buffer(opts.peerId, 'hex')
      : opts.peerId
  self.peerIdHex = self.peerId.toString('hex')

  self.nodeId = opts.nodeId === undefined
    ? new Buffer(hat(160), 'hex')
    : typeof opts.nodeId === 'string'
      ? new Buffer(opts.nodeId, 'hex')
      : opts.nodeId
  self.nodeIdHex = self.nodeId.toString('hex')

  // TODO: implement webtorrent-dht
  if (opts.dht !== false && typeof DHT === 'function' /* browser exclude */) {
    // use a single DHT instance for all torrents, so the routing table can be reused
    self.dht = new DHT(extend({ nodeId: self.nodeId }, opts.dht))
    self.dht.listen(opts.dhtPort)
  }

  debug('new webtorrent (peerId %s, nodeId %s)', self.peerIdHex, self.nodeIdHex)

  if (typeof loadIPSet === 'function') {
    loadIPSet(opts.blocklist, {
      headers: { 'user-agent': 'WebTorrent (http://webtorrent.io)' }
    }, function (err, ipSet) {
      if (err) return self.error('failed to load blocklist: ' + err.message)
      self.blocked = ipSet
      ready()
    })
  } else process.nextTick(ready)

  function ready () {
    if (self.destroyed) return
    self.ready = true
    self.emit('ready')
  }
}

/**
 * Seed ratio for all torrents in the client.
 * @type {number}
 */
Object.defineProperty(WebTorrent.prototype, 'ratio', {
  get: function () {
    var self = this
    var uploaded = self.torrents.reduce(function (total, torrent) {
      return total + torrent.uploaded
    }, 0)
    var downloaded = self.torrents.reduce(function (total, torrent) {
      return total + torrent.downloaded
    }, 0) || 1
    return uploaded / downloaded
  }
})

/**
 * Returns the torrent with the given `torrentId`. Convenience method. Easier than
 * searching through the `client.torrents` array. Returns `null` if no matching torrent
 * found.
 *
 * @param  {string|Buffer|Object} torrentId
 * @return {Torrent|null}
 */
WebTorrent.prototype.get = function (torrentId) {
  var self = this
  var parsed = parseTorrent(torrentId)
  if (!parsed.infoHash) throw new Error('Invalid torrent identifier')
  for (var i = 0, len = self.torrents.length; i < len; i++) {
    var torrent = self.torrents[i]
    if (torrent.infoHash === parsed.infoHash) return torrent
  }
  return null
}

/**
 * Start downloading a new torrent. Aliased as `client.download`.
 * @param {string|Buffer|Object} torrentId
 * @param {Object} opts torrent-specific options
 * @param {function=} ontorrent called when the torrent is ready (has metadata)
 */
WebTorrent.prototype.add =
WebTorrent.prototype.download = function (torrentId, opts, ontorrent) {
  var self = this
  if (self.destroyed) throw new Error('client is destroyed')
  debug('add %s', torrentId)
  if (typeof opts === 'function') {
    ontorrent = opts
    opts = {}
  }
  if (!opts) opts = {}

  opts.client = self
  opts.storage = opts.storage || self.storage

  if (!opts.storageOpts) opts.storageOpts = {}
  if (opts.tmp) opts.storageOpts.tmp = opts.tmp

  var torrent = new Torrent(torrentId, opts)
  self.torrents.push(torrent)

  function clientOnTorrent (_torrent) {
    if (torrent.infoHash === _torrent.infoHash) {
      ontorrent(torrent)
      self.removeListener('torrent', clientOnTorrent)
    }
  }
  if (ontorrent) self.on('torrent', clientOnTorrent)

  torrent.on('error', function (err) {
    self.emit('error', err, torrent)
  })

  torrent.on('listening', function (port) {
    self.emit('listening', port, torrent)
  })

  torrent.on('ready', function () {
    // Emit 'torrent' when a torrent is ready to be used
    debug('torrent')
    self.emit('torrent', torrent)
  })

  return torrent
}

/**
 * Start seeding a new file/folder.
 * @param  {string|File|FileList|Buffer|Array.<string|File|Buffer>} input
 * @param  {Object} opts
 * @param  {function} onseed
 */
WebTorrent.prototype.seed = function (input, opts, onseed) {
  var self = this
  if (self.destroyed) throw new Error('client is destroyed')
  debug('seed %s', input)
  if (typeof opts === 'function') {
    onseed = opts
    opts = {}
  }
  if (!opts) opts = {}
  if (!opts.storageOpts) opts.storageOpts = {}
  opts.storageOpts.noVerify = true

  createTorrent.parseInput(input, opts, function (err, files) {
    if (err) return self.emit('error', err)
    var streams = files.map(function (file) { return file.getStream })

    createTorrent(input, opts, function (err, torrentBuf) {
      if (err) return self.emit('error', err)

      // if client was destroyed asyncronously, bail early (or `add` will throw)
      if (self.destroyed) return

      self.add(torrentBuf, opts, function (torrent) {
        var tasks = [function (cb) {
          torrent.storage.load(streams, cb)
        }]
        if (self.dht) tasks.push(function (cb) {
          torrent.on('dhtAnnounce', cb)
        })
        parallel(tasks, function (err) {
          if (err) return self.emit('error', err)
          if (onseed) onseed(torrent)
          self.emit('seed', torrent)
        })
      })
    })
  })
}

/**
 * Remove a torrent from the client.
 * @param  {string|Buffer}   torrentId
 * @param  {function} cb
 */
WebTorrent.prototype.remove = function (torrentId, cb) {
  var self = this
  var torrent = self.get(torrentId)
  if (!torrent) throw new Error('No torrent with id ' + torrentId)
  debug('remove')
  self.torrents.splice(self.torrents.indexOf(torrent), 1)
  torrent.destroy(cb)
}

/**
 * Destroy the client, including all torrents and connections to peers.
 * @param  {function} cb
 */
WebTorrent.prototype.destroy = function (cb) {
  var self = this
  self.destroyed = true
  debug('destroy')

  var tasks = self.torrents.map(function (torrent) {
    return function (cb) {
      self.remove(torrent.infoHash, cb)
    }
  })

  if (self.dht) tasks.push(function (cb) {
    self.dht.destroy(cb)
  })

  parallel(tasks, cb)
}

}).call(this,require('_process'),require("buffer").Buffer)

},{"./lib/fs-storage":71,"./lib/storage":6,"./lib/torrent":7,"./package.json":71,"_process":80,"bittorrent-dht/client":71,"buffer":72,"create-torrent":10,"debug":21,"events":76,"hat":28,"inherits":29,"load-ip-set":71,"parse-torrent":33,"run-parallel":44,"speedometer":47,"xtend":66,"zero-fill":68}],3:[function(require,module,exports){
module.exports = FileStream

var debug = require('debug')('webtorrent:file-stream')
var inherits = require('inherits')
var path = require('path')
var stream = require('stream')
var MediaStream = require('./media-stream')

inherits(FileStream, stream.Readable)

/**
 * A readable stream of a torrent file.
 *
 * @param {Object} file
 * @param {number} opts.start stream slice of file, starting from this byte (inclusive)
 * @param {number} opts.end stream slice of file, ending with this byte (inclusive)
 * @param {number} opts.pieceLength length of an individual piece
 */
function FileStream (file, opts) {
  var self = this
  if (!(self instanceof FileStream)) return new FileStream(file, opts)
  stream.Readable.call(self, opts)
  debug('new filestream %s', JSON.stringify(opts))

  if (!opts) opts = {}
  if (!opts.start) opts.start = 0
  if (!opts.end) opts.end = file.length - 1

  self.length = opts.end - opts.start + 1

  var offset = opts.start + file.offset
  var pieceLength = opts.pieceLength

  self.startPiece = offset / pieceLength | 0
  self.endPiece = (opts.end + file.offset) / pieceLength | 0

  self._extname = path.extname(file.name)
  self._storage = file.storage
  self._piece = self.startPiece
  self._missing = self.length
  self._reading = false
  self._notifying = false
  self._destroyed = false
  self._criticalLength = Math.min((1024 * 1024 / pieceLength) | 0, 2)
  self._offset = offset - (self.startPiece * pieceLength)
}

FileStream.prototype._read = function () {
  debug('_read')
  var self = this
  if (self._reading) return
  self._reading = true
  self.notify()
}

FileStream.prototype.notify = function () {
  debug('notify')
  var self = this

  if (!self._reading || self._missing === 0) return
  if (!self._storage.bitfield.get(self._piece))
    return self._storage.emit('critical', self._piece, self._piece + self._criticalLength)

  if (self._notifying) return
  self._notifying = true

  var p = self._piece
  debug('before read %s', p)
  self._storage.read(self._piece++, function (err, buffer) {
    debug('after read %s (length %s) (err %s)', p, buffer.length, err && err.message)
    self._notifying = false

    if (self._destroyed) return

    if (err) {
      self._storage.emit('error', err)
      return self.destroy(err)
    }

    if (self._offset) {
      buffer = buffer.slice(self._offset)
      self._offset = 0
    }

    if (self._missing < buffer.length) {
      buffer = buffer.slice(0, self._missing)
    }
    self._missing -= buffer.length

    debug('pushing buffer of length %s', buffer.length)
    self._reading = false
    self.push(buffer)

    if (self._missing === 0) self.push(null)
  })
}

FileStream.prototype.pipe = function (dst) {
  var self = this
  var pipe = stream.Readable.prototype.pipe

  // <video> or <audio> tag
  if (dst && (dst.nodeName === 'VIDEO' || dst.nodeName === 'AUDIO')) {
    var type = {
      '.webm': 'video/webm; codecs="vorbis,vp8"',
      '.mp4': 'video/mp4; codecs="avc1.42c01e,mp4a.40.2"',
      '.mp3': 'audio/mpeg'
    }[self._extname]
    return pipe.call(self, new MediaStream(dst, { type: type }))
  } else {
    return pipe.call(self, dst)
  }
}

FileStream.prototype.destroy = function () {
  var self = this
  if (self._destroyed) return
  self._destroyed = true
}

},{"./media-stream":4,"debug":21,"inherits":29,"path":79,"stream":92}],4:[function(require,module,exports){
module.exports = MediaStream

var debug = require('debug')('webtorrent:media-stream')
var inherits = require('inherits')
var once = require('once')
var stream = require('stream')

var MediaSource = typeof window !== 'undefined' &&
  (window.MediaSource || window.WebKitMediaSource)

inherits(MediaStream, stream.Writable)

function MediaStream (media, opts) {
  var self = this
  if (!(self instanceof MediaStream)) return new MediaStream(media, opts)
  stream.Writable.call(self, opts)

  self.media = media
  opts = opts || {}
  opts.type = opts.type || 'video/webm; codecs="vorbis,vp8"'

  debug('new mediastream %s %s', media, JSON.stringify(opts))

  self._mediaSource = new MediaSource()
  self._playing = false
  self._sourceBuffer = null
  self._cb = null

  self.media.src = window.URL.createObjectURL(self._mediaSource)

  var sourceopen = once(function () {
    self._sourceBuffer = self._mediaSource.addSourceBuffer(opts.type)
    self._sourceBuffer.addEventListener('updateend', self._flow.bind(self))
    self._flow()
  })
  self._mediaSource.addEventListener('webkitsourceopen', sourceopen, false)
  self._mediaSource.addEventListener('sourceopen', sourceopen, false)

  self.on('finish', function () {
    debug('finish')
    self._mediaSource.endOfStream()
  })
  window.vs = self
}

MediaStream.prototype._write = function (chunk, encoding, cb) {
  var self = this
  if (!self._sourceBuffer) {
    self._cb = function (err) {
      if (err) return cb(err)
      self._write(chunk, encoding, cb)
    }
    return
  }

  if (self._sourceBuffer.updating)
    return cb(new Error('Cannot append buffer while source buffer updating'))

  self._sourceBuffer.appendBuffer(chunk)
  debug('appendBuffer %s', chunk.length)
  self._cb = cb
  if (!self._playing) {
    self.media.play()
    self._playing = true
  }
}

MediaStream.prototype._flow = function () {
  var self = this
  debug('flow')
  if (self._cb) {
    self._cb(null)
  }
}

},{"debug":21,"inherits":29,"once":32,"stream":92}],5:[function(require,module,exports){
module.exports = RarityMap

/**
 * Mapping of torrent pieces to their respective availability in the swarm. Used by
 * the torrent manager for implementing the rarest piece first selection strategy.
 *
 * @param {Swarm}  swarm bittorrent-swarm to track availability
 * @param {number} numPieces number of pieces in the torrent
 */
function RarityMap (swarm, numPieces) {
  var self = this

  self.swarm = swarm
  self.numPieces = numPieces

  function initWire (wire) {
    wire.on('have', function (index) {
      self.pieces[index]++
    })
    wire.on('bitfield', self.recalculate.bind(self))
    wire.on('close', function () {
      for (var i = 0; i < self.numPieces; ++i) {
        self.pieces[i] -= wire.peerPieces.get(i)
      }
    })
  }

  self.swarm.wires.forEach(initWire)
  self.swarm.on('wire', function (wire) {
    self.recalculate()
    initWire(wire)
  })

  self.recalculate()
}

/**
 * Recalculates piece availability across all peers in the swarm.
 */
RarityMap.prototype.recalculate = function () {
  var self = this

  self.pieces = []
  for (var i = 0; i < self.numPieces; ++i) {
    self.pieces[i] = 0
  }

  self.swarm.wires.forEach(function (wire) {
    for (var i = 0; i < self.numPieces; ++i) {
      self.pieces[i] += wire.peerPieces.get(i)
    }
  })
}

/**
 * Get the index of the rarest piece. Optionally, pass a filter function to exclude
 * certain pieces (for instance, those that we already have).
 *
 * @param {function} pieceFilterFunc
 * @return {number} index of rarest piece, or -1
 */
RarityMap.prototype.getRarestPiece = function (pieceFilterFunc) {
  var self = this
  var candidates = []
  var min = Infinity
  pieceFilterFunc = pieceFilterFunc || function () { return true }

  for (var i = 0; i < self.numPieces; ++i) {
    if (!pieceFilterFunc(i)) continue

    var availability = self.pieces[i]
    if (availability === min) {
      candidates.push(i)
    } else if (availability < min) {
      candidates = [ i ]
      min = availability
    }
  }

  if (candidates.length > 0) {
    // if there are multiple pieces with the same availability, choose one randomly
    return candidates[Math.random() * candidates.length | 0]
  } else {
    return -1
  }
}

},{}],6:[function(require,module,exports){
(function (process,Buffer){
module.exports = Storage

var BitField = require('bitfield')
var BlockStream = require('block-stream')
var debug = require('debug')('webtorrent:storage')
var dezalgo = require('dezalgo')
var eos = require('end-of-stream')
var EventEmitter = require('events').EventEmitter
var FileStream = require('./file-stream')
var inherits = require('inherits')
var MultiStream = require('multistream')
var once = require('once')
var sha1 = require('simple-sha1')

var BLOCK_LENGTH = 16 * 1024

var BLOCK_BLANK = 0
var BLOCK_RESERVED = 1
var BLOCK_WRITTEN = 2
function noop () {}

inherits(Piece, EventEmitter)

/**
 * A torrent piece
 *
 * @param {number} index  piece index
 * @param {string} hash   sha1 hash (hex) for this piece
 * @param {Buffer|number} buffer backing buffer, or piece length if backing buffer is lazy
 * @param {boolean=} noVerify skip piece verification (used when seeding a new file)
 */
function Piece (index, hash, buffer, noVerify) {
  var self = this
  EventEmitter.call(self)
  if (!debug.enabled) self.setMaxListeners(0)

  self.index = index
  self.hash = hash
  self.noVerify = !!noVerify

  if (typeof buffer === 'number') {
    // alloc buffer lazily
    self.buffer = null
    self.length = buffer
  } else {
    // use buffer provided
    self.buffer = buffer
    self.length = buffer.length
  }

  self._reset()
}

Piece.prototype.readBlock = function (offset, length, cb) {
  var self = this
  cb = dezalgo(cb)
  if (!self.buffer || !self._verifyOffset(offset)) {
    return cb(new Error('invalid block offset ' + offset))
  }
  cb(null, self.buffer.slice(offset, offset + length))
}

Piece.prototype.writeBlock = function (offset, buffer, cb) {
  var self = this
  cb = dezalgo(cb)
  if (!self._verifyOffset(offset) || !self._verifyBlock(offset, buffer)) {
    return cb(new Error('invalid block ' + offset + ':' + buffer.length))
  }
  self._lazyAllocBuffer()

  var i = offset / BLOCK_LENGTH
  if (self.blocks[i] === BLOCK_WRITTEN) {
    return cb(null)
  }

  buffer.copy(self.buffer, offset)
  self.blocks[i] = BLOCK_WRITTEN
  self.blocksWritten += 1

  if (self.blocksWritten === self.blocks.length) {
    self.verify()
  }

  cb(null)
}

Piece.prototype.reserveBlock = function (endGame) {
  var self = this
  var len = self.blocks.length
  for (var i = 0; i < len; i++) {
    if ((self.blocks[i] && !endGame) || self.blocks[i] === BLOCK_WRITTEN) {
      continue
    }
    self.blocks[i] = BLOCK_RESERVED
    return {
      offset: i * BLOCK_LENGTH,
      length: (i === len - 1)
        ? self.length - (i * BLOCK_LENGTH)
        : BLOCK_LENGTH
    }
  }
  return null
}

Piece.prototype.cancelBlock = function (offset) {
  var self = this
  if (!self._verifyOffset(offset)) {
    return false
  }

  var i = offset / BLOCK_LENGTH
  if (self.blocks[i] === BLOCK_RESERVED) {
    self.blocks[i] = BLOCK_BLANK
  }

  return true
}

Piece.prototype._reset = function () {
  var self = this
  self.verified = false
  self.blocks = new Buffer(Math.ceil(self.length / BLOCK_LENGTH))
  self.blocks.fill(0)
  self.blocksWritten = 0
}

Piece.prototype.verify = function (buffer) {
  var self = this
  buffer = buffer || self.buffer
  if (self.verified || !buffer) {
    return
  }

  if (self.noVerify) {
    self.verified = true
    onResult()
    return
  }

  sha1(buffer, function (expectedHash) {
    self.verified = (expectedHash === self.hash)
    onResult()
  })

  function onResult () {
    if (self.verified) {
      self.emit('done')
    } else {
      self.emit('warning', new Error('piece ' + self.index + ' failed verification'))
      self._reset()
    }
  }
}

Piece.prototype._verifyOffset = function (offset) {
  var self = this
  if (offset % BLOCK_LENGTH === 0) {
    return true
  } else {
    self.emit(
      'warning',
      new Error('invalid block offset ' + offset + ', not multiple of ' + BLOCK_LENGTH)
    )
    return false
  }
}

Piece.prototype._verifyBlock = function (offset, buffer) {
  var self = this
  if (buffer.length === BLOCK_LENGTH) {
    // normal block length
    return true
  } else if (buffer.length === self.length - offset &&
    self.length - offset < BLOCK_LENGTH) {
    // last block in piece is allowed to be less than block length
    return true
  } else {
    self.emit('warning', new Error('invalid block size ' + buffer.length))
    return false
  }
}

Piece.prototype._lazyAllocBuffer = function () {
  var self = this
  if (!self.buffer) {
    self.buffer = new Buffer(self.length)
  }
}

inherits(File, EventEmitter)

/**
 * A torrent file
 *
 * @param {Storage} storage       Storage container object
 * @param {Object}  file          the file object from the parsed torrent
 * @param {Array.<Piece>} pieces  backing pieces for this file
 * @param {number}  pieceLength   the length in bytes of a non-terminal piece
 */
function File (storage, file, pieces, pieceLength) {
  var self = this
  EventEmitter.call(self)
  if (!debug.enabled) self.setMaxListeners(0)

  self.storage = storage
  self.name = file.name
  self.path = file.path
  self.length = file.length
  self.offset = file.offset
  self.pieces = pieces
  self.pieceLength = pieceLength

  self.done = false

  self.pieces.forEach(function (piece) {
    piece.on('done', function () {
      self._checkDone()
    })
  })

  // if the file is zero-length, it will be done upon initialization
  self._checkDone()
}

/**
 * Selects the file to be downloaded, but at a lower priority than files with streams.
 * Useful if you know you need the file at a later stage.
 */
File.prototype.select = function () {
  var self = this
  if (self.pieces.length > 0) {
    var start = self.pieces[0].index
    var end = self.pieces[self.pieces.length - 1].index
    self.storage.emit('select', start, end, false)
  }
}

/**
 * Deselects the file, which means it won't be downloaded unless someone creates a stream
 * for it.
 */
File.prototype.deselect = function () {
  var self = this
  if (self.pieces.length > 0) {
    var start = self.pieces[0].index
    var end = self.pieces[self.pieces.length - 1].index
    self.storage.emit('deselect', start, end, false)
  }
}

/**
 * Create a readable stream to the file. Pieces needed by the stream will be prioritized
 * highly and fetched from the swarm first.
 *
 * @param {Object} opts
 * @param {number} opts.start stream slice of file, starting from this byte (inclusive)
 * @param {number} opts.end   stream slice of file, ending with this byte (inclusive)
 * @return {stream.Readable}
 */
File.prototype.createReadStream = function (opts) {
  var self = this
  if (!opts) opts = {}
  if (opts.pieceLength == null) opts.pieceLength = self.pieceLength
  var stream = new FileStream(self, opts)
  self.storage.emit('select', stream.startPiece, stream.endPiece, true, stream.notify.bind(stream))
  eos(stream, function () {
    self.storage.emit('deselect', stream.startPiece, stream.endPiece, true)
  })

  return stream
}

/**
 * @param {function} cb
 */
File.prototype.getBlobURL = function (cb) {
  var self = this
  self.getBuffer(function (err, buf) {
    if (err) return cb(err)
    var url = URL.createObjectURL(new Blob([ buf ]))
    cb(null, url)
  })
}

/**
 * TODO: detect errors and call callback with error
 * @param {function} cb
 */
File.prototype.getBuffer = function (cb) {
  var self = this
  var buf = new Buffer(self.length)
  var start = 0
  self.createReadStream()
    .on('data', function (chunk) {
      chunk.copy(buf, start)
      start += chunk.length
    })
    .on('end', function () {
      cb(null, buf)
    })
}

File.prototype._checkDone = function () {
  var self = this
  self.done = self.pieces.every(function (piece) {
    return piece.verified
  })

  if (self.done) {
    process.nextTick(function () {
      self.emit('done')
    })
  }
}

inherits(Storage, EventEmitter)

/**
 * Storage for a torrent download. Handles the complexities of reading and writing
 * to pieces and files.
 *
 * @param {Object} parsedTorrent
 * @param {Object} opts
 */
function Storage (parsedTorrent, opts) {
  var self = this
  EventEmitter.call(self)
  if (!debug.enabled) self.setMaxListeners(0)
  opts = opts || {}

  self.bitfield = new BitField(parsedTorrent.pieces.length)

  self.done = false
  self.closed = false
  self.readonly = true

  if (!opts.nobuffer) {
    self.buffer = new Buffer(parsedTorrent.length)
  }

  var pieceLength = self.pieceLength = parsedTorrent.pieceLength
  var lastPieceLength = parsedTorrent.lastPieceLength
  var numPieces = parsedTorrent.pieces.length

  self.pieces = parsedTorrent.pieces.map(function (hash, index) {
    var start = index * pieceLength
    var end = start + (index === numPieces - 1 ? lastPieceLength : pieceLength)

    // if we're backed by a buffer, the piece's buffer will reference the same memory.
    // otherwise, the piece's buffer will be lazily created on demand
    var buffer = (self.buffer ? self.buffer.slice(start, end) : end - start)

    var piece = new Piece(index, hash, buffer, !!opts.noVerify)
    piece.on('done', self._onPieceDone.bind(self, piece))
    return piece
  })

  self.files = parsedTorrent.files.map(function (fileObj) {
    var start = fileObj.offset
    var end = start + fileObj.length - 1

    var startPiece = start / pieceLength | 0
    var endPiece = end / pieceLength | 0
    var pieces = self.pieces.slice(startPiece, endPiece + 1)

    var file = new File(self, fileObj, pieces, pieceLength)
    file.on('done', self._onFileDone.bind(self, file))
    return file
  })
}

Storage.BLOCK_LENGTH = BLOCK_LENGTH

Storage.prototype.load = function (streams, cb) {
  var self = this
  if (!Array.isArray(streams)) streams = [ streams ]
  cb = once(cb || function () {})

  self.once('done', function () {
    cb(null)
  })

  var pieceIndex = 0
  ;(new MultiStream(streams))
    .pipe(new BlockStream(self.pieceLength, { nopad: true }))
    .on('data', function (piece) {
      var index = pieceIndex
      pieceIndex += 1

      var blockIndex = 0
      var s = new BlockStream(BLOCK_LENGTH, { nopad: true })
      s.on('data', function (block) {
        var offset = blockIndex * BLOCK_LENGTH
        blockIndex += 1

        self.writeBlock(index, offset, block)
      })
      s.end(piece)
    })
    .on('error', cb)
}

Object.defineProperty(Storage.prototype, 'downloaded', {
  get: function () {
    var self = this
    return self.pieces.reduce(function (total, piece) {
      return total + (piece.verified ? piece.length : piece.blocksWritten * BLOCK_LENGTH)
    }, 0)
  }
})

/**
 * The number of missing pieces. Used to implement 'end game' mode.
 */
Object.defineProperty(Storage.prototype, 'numMissing', {
  get: function () {
    var self = this
    var numMissing = self.pieces.length
    for (var index = 0, len = self.pieces.length; index < len; index++) {
      numMissing -= self.bitfield.get(index)
    }
    return numMissing
  }
})

/**
 * Reads a block from a piece.
 *
 * @param {number}    index    piece index
 * @param {number}    offset   byte offset within piece
 * @param {number}    length   length in bytes to read from piece
 * @param {function}  cb
 */
Storage.prototype.readBlock = function (index, offset, length, cb) {
  var self = this
  cb = dezalgo(cb)
  var piece = self.pieces[index]
  if (!piece) return cb(new Error('invalid piece index ' + index))
  piece.readBlock(offset, length, cb)
}

/**
 * Writes a block to a piece.
 *
 * @param {number}  index    piece index
 * @param {number}  offset   byte offset within piece
 * @param {Buffer}  buffer   buffer to write
 * @param {function}  cb
 */
Storage.prototype.writeBlock = function (index, offset, buffer, cb) {
  var self = this
  if (!cb) cb = noop
  cb = dezalgo(cb)

  if (self.readonly) return cb(new Error('cannot write to readonly storage'))
  var piece = self.pieces[index]
  if (!piece) return cb(new Error('invalid piece index ' + index))
  piece.writeBlock(offset, buffer, cb)
}

/**
 * Reads a piece or a range of a piece.
 *
 * @param {number}   index         piece index
 * @param {Object=}  range         optional range within piece
 * @param {number}   range.offset  byte offset within piece
 * @param {number}   range.length  length in bytes to read from piece
 * @param {function} cb
 * @param {boolean}  force         optionally overrides default check preventing reading
 *                                 from unverified piece
 */
Storage.prototype.read = function (index, range, cb, force) {
  var self = this

  if (typeof range === 'function') {
    force = cb
    cb = range
    range = null
  }
  cb = dezalgo(cb)

  var piece = self.pieces[index]
  if (!piece) {
    return cb(new Error('invalid piece index ' + index))
  }

  if (!piece.verified && !force) {
    return cb(new Error('Storage.read called on incomplete piece ' + index))
  }

  var offset = 0
  var length = piece.length

  if (range) {
    offset = range.offset || 0
    length = range.length || length
  }

  if (piece.buffer) {
    // shortcut for piece with static backing buffer
    return cb(null, piece.buffer.slice(offset, offset + length))
  }

  var blocks = []
  function readNextBlock () {
    if (length <= 0) return cb(null, Buffer.concat(blocks))

    var blockOffset = offset
    var blockLength = Math.min(BLOCK_LENGTH, length)

    offset += blockLength
    length -= blockLength

    self.readBlock(index, blockOffset, blockLength, function (err, block) {
      if (err) return cb(err)

      blocks.push(block)
      readNextBlock()
    })
  }

  readNextBlock()
}

/**
 * Reserves a block from the given piece.
 *
 * @param {number}  index    piece index
 * @param {Boolean} endGame  whether or not end game mode is enabled
 *
 * @returns {Object|null} reservation with offset and length or null if failed.
 */
Storage.prototype.reserveBlock = function (index, endGame) {
  var self = this
  var piece = self.pieces[index]
  if (!piece) return null

  return piece.reserveBlock(endGame)
}

/**
 * Cancels a previous block reservation from the given piece.
 *
 * @param {number}  index   piece index
 * @param {number}  offset  byte offset of block in piece
 *
 * @returns {Boolean}
 */
Storage.prototype.cancelBlock = function (index, offset) {
  var self = this
  var piece = self.pieces[index]
  if (!piece) return false

  return piece.cancelBlock(offset)
}

/**
 * Removes and cleans up any backing store for this storage.
 * @param {function=} cb
 */
Storage.prototype.remove = function (cb) {
  if (cb) dezalgo(cb)(null)
}

/**
 * Closes the backing store for this storage.
 * @param {function=} cb
 */
Storage.prototype.close = function (cb) {
  var self = this
  self.closed = true
  if (cb) dezalgo(cb)(null)
}

//
// HELPER METHODS
//

Storage.prototype._onPieceDone = function (piece) {
  var self = this
  self.bitfield.set(piece.index)
  debug('piece done ' + piece.index + ' (' + self.numMissing + ' still missing)')
  self.emit('piece', piece)
}

Storage.prototype._onFileDone = function (file) {
  var self = this
  debug('file done ' + file.name)
  self.emit('file', file)

  self._checkDone()
}

Storage.prototype._checkDone = function () {
  var self = this

  if (!self.done && self.files.every(function (file) { return file.done })) {
    self.done = true
    self.emit('done')
  }
}

}).call(this,require('_process'),require("buffer").Buffer)

},{"./file-stream":3,"_process":80,"bitfield":8,"block-stream":9,"buffer":72,"debug":21,"dezalgo":24,"end-of-stream":27,"events":76,"inherits":29,"multistream":30,"once":32,"simple-sha1":45}],7:[function(require,module,exports){
(function (process){
module.exports = Torrent

var addrToIPPort = require('addr-to-ip-port') // browser exclude
var debug = require('debug')('webtorrent:torrent')
var Discovery = require('torrent-discovery')
var EventEmitter = require('events').EventEmitter
var fs = require('fs') // browser exclude
var get = require('simple-get') // browser exclude
var inherits = require('inherits')
var parallel = require('run-parallel')
var parseTorrent = require('parse-torrent')
var reemit = require('re-emitter')
var Swarm = require('bittorrent-swarm') // `webtorrent-swarm` in browser
var ut_metadata = require('ut_metadata')
var ut_pex = require('ut_pex') // browser exclude

var RarityMap = require('./rarity-map')
var Server = require('./server') // browser exclude
var Storage = require('./storage')

var MAX_BLOCK_LENGTH = 128 * 1024
var PIECE_TIMEOUT = 10000
var CHOKE_TIMEOUT = 5000
var SPEED_THRESHOLD = 3 * Storage.BLOCK_LENGTH

var PIPELINE_MIN_DURATION = 0.5
var PIPELINE_MAX_DURATION = 1

var RECHOKE_INTERVAL = 10000 // 10 seconds
var RECHOKE_OPTIMISTIC_DURATION = 2 // 30 seconds

function noop () {}

inherits(Torrent, EventEmitter)

/**
 * A torrent
 *
 * @param {string|Buffer|Object} torrentId
 * @param {Object} opts
 */
function Torrent (torrentId, opts) {
  var self = this
  EventEmitter.call(self)
  if (!debug.enabled) self.setMaxListeners(0)
  debug('new torrent')

  self.client = opts.client

  self.hotswapEnabled = ('hotswap' in opts ? opts.hotswap : true)
  self.verify = opts.verify
  self.storageOpts = opts.storageOpts

  self.chokeTimeout = opts.chokeTimeout || CHOKE_TIMEOUT
  self.pieceTimeout = opts.pieceTimeout || PIECE_TIMEOUT
  self.strategy = opts.strategy || 'sequential'

  self._rechokeNumSlots = (opts.uploads === false || opts.uploads === 0) ? 0 : (+opts.uploads || 10)
  self._rechokeOptimisticWire = null
  self._rechokeOptimisticTime = 0
  self._rechokeIntervalId = null

  self.ready = false
  self.files = []
  self.metadata = null
  self.parsedTorrent = null
  self.storage = null
  self.numBlockedPeers = 0
  self._amInterested = false
  self._destroyed = false
  self._selections = []
  self._critical = []
  self._storageImpl = opts.storage || Storage

  var parsedTorrent
  try {
    parsedTorrent = (torrentId && torrentId.parsedTorrent) || parseTorrent(torrentId)
  } catch (err) {
    // If torrent fails to parse, it could be an http/https URL or filesystem path, so
    // don't consider it an error yet.
  }

  if (parsedTorrent && parsedTorrent.infoHash) {
    onTorrentId(parsedTorrent)
  } else if (typeof get === 'function' && /^https?:/.test(torrentId)) {
    // http or https url to torrent file
    get.concat({
      url: torrentId,
      headers: { 'user-agent': 'WebTorrent (http://webtorrent.io)' }
    }, function (err, data) {
      if (err) {
        err = new Error('Error downloading torrent: ' + err.message)
        return self.emit('error', err)
      }
      onTorrentId(data)
    })
  } else if (typeof fs.readFile === 'function') {
    // assume it's a filesystem path
    fs.readFile(torrentId, function (err, torrent) {
      if (err) return self.emit('error', new Error('Invalid torrent identifier'))
      onTorrentId(torrent)
    })
  } else throw new Error('Invalid torrent identifier')

  function onTorrentId (torrentId) {
    try {
      self.parsedTorrent = parseTorrent(torrentId)
    } catch (err) {
      return self.emit('error', new Error('Malformed torrent data: ' + err.message))
    }

    self.infoHash = self.parsedTorrent.infoHash

    if (!self.infoHash) {
      return self.emit('error', new Error('Malformed torrent data: Missing info hash.'))
    }

    if (self.parsedTorrent.name) self.name = self.parsedTorrent.name // preliminary name

    // create swarm
    self.swarm = new Swarm(self.infoHash, self.client.peerId, {
      handshake: { dht: !!self.client.dht }
    })
    reemit(self.swarm, self, ['warning', 'error'])
    self.swarm.on('wire', self._onWire.bind(self))

    // update overall client stats
    self.swarm.on('download', self.client.downloadSpeed.bind(self.client))
    self.swarm.on('upload', self.client.uploadSpeed.bind(self.client))

    if (process.browser) {
      // in browser, swarm does not listen
      self._onSwarmListening()
    } else {
      // listen for peers
      self.swarm.listen(self.client.torrentPort, self._onSwarmListening.bind(self))
    }
    process.nextTick(function () {
      self.emit('infoHash')
    })
  }
}

// torrent size (in bytes)
Object.defineProperty(Torrent.prototype, 'length', {
  get: function () {
    return (this.parsedTorrent && this.parsedTorrent.length) || 0
  }
})

// time remaining (in milliseconds)
Object.defineProperty(Torrent.prototype, 'timeRemaining', {
  get: function () {
    if (this.swarm.downloadSpeed() === 0) return Infinity
    else return ((this.length - this.downloaded) / this.swarm.downloadSpeed()) * 1000
  }
})

// percentage complete, represented as a number between 0 and 1
Object.defineProperty(Torrent.prototype, 'progress', {
  get: function () {
    return (this.parsedTorrent && (this.downloaded / this.parsedTorrent.length)) || 0
  }
})

// bytes downloaded (not necessarily verified)
Object.defineProperty(Torrent.prototype, 'downloaded', {
  get: function () {
    return (this.storage && this.storage.downloaded) || 0
  }
})

// bytes uploaded
Object.defineProperty(Torrent.prototype, 'uploaded', {
  get: function () {
    return this.swarm.uploaded
  }
})

// ratio of bytes downloaded to uploaded
Object.defineProperty(Torrent.prototype, 'ratio', {
  get: function () {
    return (this.uploaded && (this.downloaded / this.uploaded)) || 0
  }
})

Object.defineProperty(Torrent.prototype, 'magnetURI', {
  get: function () {
    return parseTorrent.toMagnetURI(this.parsedTorrent)
  }
})

Torrent.prototype._onSwarmListening = function (port) {
  var self = this
  if (self._destroyed) return

  self.client.torrentPort = port

  // begin discovering peers via the DHT and tracker servers
  self.discovery = new Discovery({
    announce: self.parsedTorrent.announce,
    dht: self.client.dht,
    tracker: self.client.tracker,
    peerId: self.client.peerId,
    port: port,
    rtcConfig: self.client.rtcConfig
  })
  self.discovery.setTorrent(self.infoHash)
  self.discovery.on('peer', self.addPeer.bind(self))

  // expose discovery events
  reemit(self.discovery, self, ['dhtAnnounce', 'warning', 'error'])

  // if full metadata was included in initial torrent id, use it
  if (self.parsedTorrent.info) self._onMetadata(self.parsedTorrent)

  self.emit('listening', port)
}

/**
 * Called when the metadata is received.
 */
Torrent.prototype._onMetadata = function (metadata) {
  var self = this
  if (self.metadata || self._destroyed) return
  debug('got metadata')

  if (metadata && metadata.infoHash) {
    // `metadata` is a parsed torrent (from parse-torrent module)
    self.metadata = parseTorrent.toTorrentFile(metadata)
    self.parsedTorrent = metadata
  } else {
    self.metadata = metadata
    try {
      self.parsedTorrent = parseTorrent(self.metadata)
    } catch (err) {
      return self.emit('error', err)
    }
  }

  // update preliminary torrent name
  self.name = self.parsedTorrent.name

  // update discovery module with full torrent metadata
  self.discovery.setTorrent(self.parsedTorrent)

  self.rarityMap = new RarityMap(self.swarm, self.parsedTorrent.pieces.length)

  self.storage = new self._storageImpl(self.parsedTorrent, self.storageOpts)
  self.storage.on('piece', self._onStoragePiece.bind(self))
  self.storage.on('file', function (file) {
    self.emit('file', file)
  })

  self._reservations = self.storage.pieces.map(function () {
    return []
  })

  self.storage.on('done', function () {
    if (self.discovery.tracker)
      self.discovery.tracker.complete()

    debug('torrent ' + self.infoHash + ' done')
    self.emit('done')
  })

  self.storage.on('select', self.select.bind(self))
  self.storage.on('deselect', self.deselect.bind(self))
  self.storage.on('critical', self.critical.bind(self))

  self.storage.files.forEach(function (file) {
    self.files.push(file)
  })

  self.swarm.wires.forEach(function (wire) {
    // If we didn't have the metadata at the time ut_metadata was initialized for this
    // wire, we still want to make it available to the peer in case they request it.
    if (wire.ut_metadata) wire.ut_metadata.setMetadata(self.metadata)

    self._onWireWithMetadata(wire)
  })

  if (self.verify) {
    process.nextTick(function () {
      debug('verifying existing torrent data')
      var numPieces = 0
      var numVerified = 0

      // TODO: move storage verification to storage.js?
      parallel(self.storage.pieces.map(function (piece) {
        return function (cb) {
          self.storage.read(piece.index, function (err, buffer) {
            numPieces += 1
            self.emit('verifying', {
              percentDone: 100 * numPieces / self.storage.pieces.length,
              percentVerified: 100 * numVerified / self.storage.pieces.length
            })

            if (!err && buffer) {
              // TODO: this is a bit hacky; figure out a cleaner way of verifying the buffer
              piece.verify(buffer)
              numVerified += piece.verified
              debug('piece ' + (piece.verified ? 'verified' : 'invalid') + ' ' + piece.index)
            }
            // continue regardless of whether piece verification failed
            cb()
          }, true) // forces override to allow reading from non-verified pieces
        }
      }), self._onStorage.bind(self))
    })
  } else {
    process.nextTick(self._onStorage.bind(self))
  }

  process.nextTick(function () {
    self.emit('metadata')
  })
}

/**
 * Destroy and cleanup this torrent.
 */
Torrent.prototype.destroy = function (cb) {
  var self = this
  debug('destroy')
  self._destroyed = true
  clearInterval(self._rechokeIntervalId)

  var tasks = []
  if (self.swarm) tasks.push(function (cb) {
    self.swarm.destroy(cb)
  })
  if (self.discovery) tasks.push(function (cb) {
    self.discovery.stop(cb)
  })
  if (self.storage) tasks.push(function (cb) {
    self.storage.close(cb)
  })
  parallel(tasks, cb)
}

/**
 * Add a peer to the swarm
 * @param {string|SimplePeer} peer
 * @return {boolean} true if peer was added, false if peer was blocked
 */
Torrent.prototype.addPeer = function (peer) {
  var self = this
  // TODO: extract IP address from peer object and check blocklist
  if (typeof peer === 'string'
      && self.client.blocked
      && self.client.blocked.contains(addrToIPPort(peer)[0])) {
    self.numBlockedPeers += 1
    self.emit('blocked-peer', peer)
    return false
  } else {
    self.emit('peer', peer)
    self.swarm.addPeer(peer)
    return true
  }
}

/**
 * Select a range of pieces to prioritize.
 *
 * @param {number}    start     start piece index (inclusive)
 * @param {number}    end       end piece index (inclusive)
 * @param {number}    priority  priority associated with this selection
 * @param {function}  notify    callback when selection is updated with new data
 */
Torrent.prototype.select = function (start, end, priority, notify) {
  var self = this
  if (start > end || start < 0 || end >= self.storage.pieces.length)
    throw new Error('invalid selection ', start, ':', end)
  priority = Number(priority) || 0

  debug('select %s-%s (priority %s)', start, end, priority)

  self._selections.push({
    from: start,
    to: end,
    offset: 0,
    priority: priority,
    notify: notify || noop
  })

  self._selections.sort(function (a, b) {
    return b.priority - a.priority
  })

  self._updateSelections()
}

/**
 * Deprioritizes a range of previously selected pieces.
 *
 * @param {number}  start     start piece index (inclusive)
 * @param {number}  end       end piece index (inclusive)
 * @param {number}  priority  priority associated with the selection
 */
Torrent.prototype.deselect = function (start, end, priority) {
  var self = this
  priority = Number(priority) || 0
  debug('deselect %s-%s (priority %s)', start, end, priority)

  for (var i = 0; i < self._selections.length; ++i) {
    var s = self._selections[i]
    if (s.from === start && s.to === end && s.priority === priority) {
      self._selections.splice(i--, 1)
      break
    }
  }

  self._updateSelections()
}

/**
 * Marks a range of pieces as critical priority to be downloaded ASAP.
 *
 * @param {number}  start  start piece index (inclusive)
 * @param {number}  end    end piece index (inclusive)
 */
Torrent.prototype.critical = function (start, end) {
  var self = this
  debug('critical %s-%s', start, end)

  for (var i = start; i <= end; ++i) {
    self._critical[i] = true
  }

  self._updateSelections()
}

Torrent.prototype._onWire = function (wire) {
  var self = this

  // use ut_metadata extension
  wire.use(ut_metadata(self.metadata))

  if (!self.metadata) {
    wire.ut_metadata.on('metadata', function (metadata) {
      debug('got metadata via ut_metadata')
      self._onMetadata(metadata)
    })
    wire.ut_metadata.fetch()
  }

  // use ut_pex extension
  if (typeof ut_pex === 'function') wire.use(ut_pex())

  // wire.ut_pex.start() // TODO two-way communication
  if (wire.ut_pex) wire.ut_pex.on('peer', function (peer) {
    debug('got peer via ut_pex ' + peer)
    self.addPeer(peer)
  })

  if (wire.ut_pex) wire.ut_pex.on('dropped', function (peer) {
    // the remote peer believes a given peer has been dropped from the swarm.
    // if we're not currently connected to it, then remove it from the swarm's queue.
    if (!(peer in self.swarm._peers)) self.swarm.removePeer(peer)
  })

  // Send KEEP-ALIVE (every 60s) so peers will not disconnect the wire
  wire.setKeepAlive(true)

  // If peer supports DHT, send PORT message to report DHT node listening port
  if (wire.peerExtensions.dht && self.client.dht && self.client.dht.listening) {
    wire.port(self.client.dht.address().port)
  }

  // When peer sends PORT, add them to the routing table
  wire.on('port', function (port) {
    debug('port %s message from %s', port, wire.remoteAddress)
    // TODO: dht should support adding a node when you don't know the nodeId
    // dht.addNode(wire.remoteAddress + ':' + port)
  })

  wire.on('timeout', function () {
    debug('wire timeout from ' + wire.remoteAddress)
    // TODO: this might be destroying wires too eagerly
    wire.destroy()
  })

  // Timeout for piece requests to this peer
  wire.setTimeout(self.pieceTimeout)

  if (self.metadata) {
    self._onWireWithMetadata(wire)
  }
}

Torrent.prototype._onWireWithMetadata = function (wire) {
  var self = this
  var timeoutId = null
  var timeoutMs = self.chokeTimeout

  function onChokeTimeout () {
    if (self._destroyed || wire._destroyed) return

    if (self.swarm.numQueued > 2 * (self.swarm.numConns - self.swarm.numPeers) &&
      wire.amInterested) {
      wire.destroy()
    } else {
      timeoutId = setTimeout(onChokeTimeout, timeoutMs)
    }
  }

  var i = 0
  function updateSeedStatus () {
    if (wire.peerPieces.length !== self.storage.pieces.length) return
    for (; i < self.storage.pieces.length; ++i) {
      if (!wire.peerPieces.get(i)) return
    }
    wire.isSeeder = true
    wire.choke() // always choke seeders
  }

  wire.on('bitfield', function () {
    updateSeedStatus()
    self._update()
  })

  wire.on('have', function () {
    updateSeedStatus()
    self._update()
  })

  wire.once('interested', function () {
    wire.unchoke()
  })

  wire.on('close', function () {
    clearTimeout(timeoutId)
  })

  wire.on('choke', function () {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(onChokeTimeout, timeoutMs)
  })

  wire.on('unchoke', function () {
    clearTimeout(timeoutId)
    self._update()
  })

  wire.on('request', function (index, offset, length, cb) {
    // Disconnect from peers that request more than 128KB, per spec
    if (length > MAX_BLOCK_LENGTH) {
      debug(wire.remoteAddress, 'requested invalid block size', length)
      return wire.destroy()
    }

    self.storage.readBlock(index, offset, length, cb)
  })

  wire.bitfield(self.storage.bitfield) // always send bitfield (required)
  wire.interested() // always start out interested

  timeoutId = setTimeout(onChokeTimeout, timeoutMs)

  wire.isSeeder = false
  updateSeedStatus()
}

/**
 * Called when the metadata, swarm, and underlying storage are all fully initialized.
 */
Torrent.prototype._onStorage = function () {
  var self = this
  if (self._destroyed) return
  debug('on storage')

  // allow writes to storage only after initial piece verification is finished
  self.storage.readonly = false

  // start off selecting the entire torrent with low priority
  self.select(0, self.storage.pieces.length - 1, false)

  self._rechokeIntervalId = setInterval(self._rechoke.bind(self), RECHOKE_INTERVAL)
  if (self._rechokeIntervalId.unref) self._rechokeIntervalId.unref()

  process.nextTick(function () {
    self.ready = true
    self.emit('ready')
  })
}

/**
 * When a piece is fully downloaded, notify all peers with a HAVE message.
 * @param {Piece} piece
 */
Torrent.prototype._onStoragePiece = function (piece) {
  var self = this
  debug('piece done %s', piece.index)
  self._reservations[piece.index] = null

  self.swarm.wires.forEach(function (wire) {
    wire.have(piece.index)
  })

  self._gcSelections()
}

/**
 * Called on selection changes.
 */
Torrent.prototype._updateSelections = function () {
  var self = this
  if (!self.swarm || self._destroyed) return
  if (!self.metadata) return self.once('metadata', self._updateSelections.bind(self))

  process.nextTick(self._gcSelections.bind(self))
  self._updateInterest()
  self._update()
}

/**
 * Garbage collect selections with respect to the storage's current state.
 */
Torrent.prototype._gcSelections = function () {
  var self = this

  for (var i = 0; i < self._selections.length; i++) {
    var s = self._selections[i]
    var oldOffset = s.offset

    // check for newly downloaded pieces in selection
    while (self.storage.bitfield.get(s.from + s.offset) && s.from + s.offset < s.to) {
      s.offset++
    }

    if (oldOffset !== s.offset) s.notify()
    if (s.to !== s.from + s.offset) continue
    if (!self.storage.bitfield.get(s.from + s.offset)) continue

    // remove fully downloaded selection
    self._selections.splice(i--, 1) // decrement i to offset splice
    s.notify() // TODO: this may notify twice in a row. is this a problem?
    self._updateInterest()
  }

  if (!self._selections.length) self.emit('idle')
}

/**
 * Update interested status for all peers.
 */
Torrent.prototype._updateInterest = function () {
  var self = this

  var prev = self._amInterested
  self._amInterested = !!self._selections.length

  self.swarm.wires.forEach(function (wire) {
    // TODO: only call wire.interested if the wire has at least one piece we need
    if (self._amInterested) wire.interested()
    else wire.uninterested()
  })

  if (prev === self._amInterested) return
  if (self._amInterested) self.emit('interested')
  else self.emit('uninterested')
}

/**
 * Heartbeat to update all peers and their requests.
 */
Torrent.prototype._update = function () {
  var self = this
  if (self._destroyed) return

  // update wires in random order for better request distribution
  randomizedForEach(self.swarm.wires, self._updateWire.bind(self))
}

/**
 * Attempts to update a peer's requests
 */
Torrent.prototype._updateWire = function (wire) {
  var self = this

  if (wire.peerChoking) return
  if (!wire.downloaded) return validateWire()

  var minOutstandingRequests = getPipelineLength(wire, PIPELINE_MIN_DURATION)
  if (wire.requests.length >= minOutstandingRequests) return
  var maxOutstandingRequests = getPipelineLength(wire, PIPELINE_MAX_DURATION)

  trySelectWire(false) || trySelectWire(true)

  function genPieceFilterFunc (start, end, tried, rank) {
    return function (i) {
      return i >= start && i <= end && !(i in tried) && wire.peerPieces.get(i) && (!rank || rank(i))
    }
  }

  // TODO: Do we need both validateWire and trySelectWire?
  function validateWire () {
    if (wire.requests.length) return

    for (var i = self._selections.length; i--;) {
      var next = self._selections[i]

      var piece
      if (self.strategy === 'rarest') {
        var start = next.from + next.offset
        var end = next.to
        var len = end - start + 1
        var tried = {}
        var tries = 0
        var filter = genPieceFilterFunc(start, end, tried)

        while (tries < len) {
          piece = self.rarityMap.getRarestPiece(filter)
          if (piece < 0) break
          if (self._request(wire, piece, false)) return
          tried[piece] = true
          tries += 1
        }
      } else {
        for (piece = next.to; piece >= next.from + next.offset; --piece) {
          if (!wire.peerPieces.get(piece)) continue
          if (self._request(wire, piece, false)) return
        }
      }
    }

    // TODO: wire failed to validate as useful; should we close it?
  }

  function speedRanker () {
    var speed = wire.downloadSpeed() || 1
    if (speed > SPEED_THRESHOLD) return function () { return true }

    var secs = Math.max(1, wire.requests.length) * Storage.BLOCK_LENGTH / speed
    var tries = 10
    var ptr = 0

    return function (index) {
      if (!tries || self.storage.bitfield.get(index)) return true

      var piece = self.storage.pieces[index]
      var missing = piece.blocks.length - piece.blocksWritten

      for (; ptr < self.swarm.wires.length; ptr++) {
        var otherWire = self.swarm.wires[ptr]
        var otherSpeed = otherWire.downloadSpeed()

        if (otherSpeed < SPEED_THRESHOLD) continue
        if (otherSpeed <= speed) continue
        if (!otherWire.peerPieces.get(index)) continue
        if ((missing -= otherSpeed * secs) > 0) continue

        tries--
        return false
      }

      return true
    }
  }

  function shufflePriority (i) {
    var last = i
    for (var j = i; j < self._selections.length && self._selections[j].priority; j++) {
      last = j
    }
    var tmp = self._selections[i]
    self._selections[i] = self._selections[last]
    self._selections[last] = tmp
  }

  function trySelectWire (hotswap) {
    if (wire.requests.length >= maxOutstandingRequests) return true
    var rank = speedRanker()

    for (var i = 0; i < self._selections.length; i++) {
      var next = self._selections[i]

      var piece
      if (self.strategy === 'rarest') {
        var start = next.from + next.offset
        var end = next.to
        var len = end - start + 1
        var tried = {}
        var tries = 0
        var filter = genPieceFilterFunc(start, end, tried, rank)

        while (tries < len) {
          piece = self.rarityMap.getRarestPiece(filter)
          if (piece < 0) break

          // request all non-reserved blocks in this piece
          while (self._request(wire, piece, self._critical[piece] || hotswap)) {}

          if (wire.requests.length < maxOutstandingRequests) {
            tried[piece] = true
            tries++
            continue
          }

          if (next.priority) shufflePriority(i)
          return true
        }
      } else {
        for (piece = next.from + next.offset; piece <= next.to; piece++) {
          if (!wire.peerPieces.get(piece) || !rank(piece)) continue

          // request all non-reserved blocks in piece
          while (self._request(wire, piece, self._critical[piece] || hotswap)) {}

          if (wire.requests.length < maxOutstandingRequests) continue

          if (next.priority) shufflePriority(i)
          return true
        }
      }
    }

    return false
  }
}

/**
 * Called periodically to update the choked status of all peers, handling optimistic
 * unchoking as described in BEP3.
 */
Torrent.prototype._rechoke = function () {
  var self = this

  if (self._rechokeOptimisticTime > 0)
    self._rechokeOptimisticTime -= 1
  else
    self._rechokeOptimisticWire = null

  var peers = []

  self.swarm.wires.forEach(function (wire) {
    if (!wire.isSeeder && wire !== self._rechokeOptimisticWire) {
      peers.push({
        wire: wire,
        downloadSpeed: wire.downloadSpeed(),
        uploadSpeed: wire.uploadSpeed(),
        salt: Math.random(),
        isChoked: true
      })
    }
  })

  peers.sort(rechokeSort)

  var unchokeInterested = 0
  var i = 0
  for (; i < peers.length && unchokeInterested < self._rechokeNumSlots; ++i) {
    peers[i].isChoked = false
    if (peers[i].wire.peerInterested) unchokeInterested += 1
  }

  // Optimistically unchoke a peer
  if (!self._rechokeOptimisticWire && i < peers.length && self._rechokeNumSlots) {
    var candidates = peers.slice(i).filter(function (peer) { return peer.wire.peerInterested })
    var optimistic = candidates[randomInt(candidates.length)]

    if (optimistic) {
      optimistic.isChoked = false
      self._rechokeOptimisticWire = optimistic.wire
      self._rechokeOptimisticTime = RECHOKE_OPTIMISTIC_DURATION
    }
  }

  // Unchoke best peers
  peers.forEach(function (peer) {
    if (peer.wire.amChoking !== peer.isChoked) {
      if (peer.isChoked) peer.wire.choke()
      else peer.wire.unchoke()
    }
  })

  function rechokeSort (peerA, peerB) {
    // Prefer higher download speed
    if (peerA.downloadSpeed !== peerB.downloadSpeed)
      return peerB.downloadSpeed - peerA.downloadSpeed

    // Prefer higher upload speed
    if (peerA.uploadSpeed !== peerB.uploadSpeed)
      return peerB.uploadSpeed - peerA.uploadSpeed

    // Prefer unchoked
    if (peerA.wire.amChoking !== peerB.wire.amChoking)
      return peerA.wire.amChoking ? 1 : -1

    // Random order
    return peerA.salt - peerB.salt
  }
}

/**
 * Attempts to cancel a slow block request from another wire such that the
 * given wire may effectively swap out the request for one of its own.
 */
Torrent.prototype._hotswap = function (wire, index) {
  var self = this
  if (!self.hotswapEnabled) return false

  var speed = wire.downloadSpeed()
  if (speed < Storage.BLOCK_LENGTH) return false
  if (!self._reservations[index]) return false

  var r = self._reservations[index]
  if (!r) {
    return false
  }

  var minSpeed = Infinity
  var minWire

  var i
  for (i = 0; i < r.length; i++) {
    var otherWire = r[i]
    if (!otherWire || otherWire === wire) continue

    var otherSpeed = otherWire.downloadSpeed()
    if (otherSpeed >= SPEED_THRESHOLD) continue
    if (2 * otherSpeed > speed || otherSpeed > minSpeed) continue

    minWire = otherWire
    minSpeed = otherSpeed
  }

  if (!minWire) return false

  for (i = 0; i < r.length; i++) {
    if (r[i] === minWire) r[i] = null
  }

  for (i = 0; i < minWire.requests.length; i++) {
    var req = minWire.requests[i]
    if (req.piece !== index) continue

    self.storage.cancelBlock(index, req.offset)
  }

  self.emit('hotswap', minWire, wire, index)
  return true
}

/**
 * Attempts to request a block from the given wire.
 */
Torrent.prototype._request = function (wire, index, hotswap) {
  var self = this
  var numRequests = wire.requests.length

  if (self.storage.bitfield.get(index)) return false
  var maxOutstandingRequests = getPipelineLength(wire, PIPELINE_MAX_DURATION)
  if (numRequests >= maxOutstandingRequests) return false

  var endGame = (wire.requests.length === 0 && self.storage.numMissing < 30)
  var block = self.storage.reserveBlock(index, endGame)

  if (!block && !endGame && hotswap && self._hotswap(wire, index))
    block = self.storage.reserveBlock(index, false)
  if (!block) return false

  var r = self._reservations[index]
  if (!r) {
    r = self._reservations[index] = []
  }
  var i = r.indexOf(null)
  if (i === -1) i = r.length
  r[i] = wire

  function gotPiece (err, buffer) {
    if (!self.ready) {
      self.once('ready', function () {
        gotPiece(err, buffer)
      })
      return
    }

    if (r[i] === wire) r[i] = null

    if (err) {
      debug(
        'error getting piece %s (offset: %s length: %s) from %s: %s',
        index, block.offset, block.length, wire.remoteAddress, err.message
      )
      self.storage.cancelBlock(index, block.offset)
      process.nextTick(self._update.bind(self))
      return false
    } else {
      debug(
        'got piece %s (offset: %s length: %s) from %s',
        index, block.offset, block.length, wire.remoteAddress
      )
      self.storage.writeBlock(index, block.offset, buffer, function (err) {
        if (err) {
          debug('error writing block')
          self.storage.cancelBlock(index, block.offset)
        }

        process.nextTick(self._update.bind(self))
      })
    }
  }

  wire.request(index, block.offset, block.length, gotPiece)

  return true
}

Torrent.prototype.createServer = function (opts) {
  var self = this
  if (typeof Server === 'function' /* browser exclude */) {
    return new Server(self, opts)
  }
}

function getPipelineLength (wire, duration) {
  return Math.ceil(2 + duration * wire.downloadSpeed() / Storage.BLOCK_LENGTH)
}

/**
 * Returns a random integer in [0,high)
 */
function randomInt (high) {
  return Math.random() * high | 0
}

/**
 * Iterates through the given array in a random order, calling the given
 * callback for each element.
 */
function randomizedForEach (array, cb) {
  var indices = array.map(function (value, index) { return index })

  for (var i = indices.length - 1; i > 0; --i) {
    var j = randomInt(i + 1)
    var tmp = indices[i]
    indices[i] = indices[j]
    indices[j] = tmp
  }

  indices.forEach(function (index) {
    cb(array[index], index, array)
  })
}

}).call(this,require('_process'))

},{"./rarity-map":5,"./server":71,"./storage":6,"_process":80,"addr-to-ip-port":71,"bittorrent-swarm":60,"debug":21,"events":76,"fs":69,"inherits":29,"parse-torrent":33,"re-emitter":43,"run-parallel":44,"simple-get":71,"torrent-discovery":48,"ut_metadata":55,"ut_pex":71}],8:[function(require,module,exports){
(function (Buffer){
var Container = typeof Buffer !== "undefined" ? Buffer //in node, use buffers
		: typeof Int8Array !== "undefined" ? Int8Array //in newer browsers, use webgl int8arrays
		: function(l){ var a = new Array(l); for(var i = 0; i < l; i++) a[i]=0; }; //else, do something similar

function BitField(data, opts){
	if(!(this instanceof BitField)) {
		return new BitField(data, opts);
	}

	if(arguments.length === 0){
		data = 0;
	}

	this.grow = opts && (isFinite(opts.grow) && getByteSize(opts.grow) || opts.grow) || 0;

	if(typeof data === "number" || data === undefined){
		data = new Container(getByteSize(data));
		if(data.fill) data.fill(0); // clear node buffers of garbage
	}
	this.buffer = data;
}

function getByteSize(num){
	var out = num >> 3;
	if(num % 8 !== 0) out++;
	return out;
}

BitField.prototype.get = function(i){
	var j = i >> 3;
	return (j < this.buffer.length) &&
		!!(this.buffer[j] & (128 >> (i % 8)));
};

BitField.prototype.set = function(i, b){
	var j = i >> 3;
	if (b || arguments.length === 1){
		if (this.buffer.length < j + 1) this._grow(Math.max(j + 1, Math.min(2 * this.buffer.length, this.grow)));
		// Set
		this.buffer[j] |= 128 >> (i % 8);
	} else if (j < this.buffer.length) {
		/// Clear
		this.buffer[j] &= ~(128 >> (i % 8));
	}
};

BitField.prototype._grow = function(length) {
	if (this.buffer.length < length && length <= this.grow) {
		var newBuffer = new Container(length);
		if (newBuffer.fill) newBuffer.fill(0);
		if (this.buffer.copy) this.buffer.copy(newBuffer, 0);
		else {
			for(var i = 0; i < this.buffer.length; i++) {
				newBuffer[i] = this.buffer[i];
			}
		}
		this.buffer = newBuffer;
	}
};

if(typeof module !== "undefined") module.exports = BitField;

}).call(this,require("buffer").Buffer)

},{"buffer":72}],9:[function(require,module,exports){
(function (process,Buffer){
// write data to it, and it'll emit data in 512 byte blocks.
// if you .end() or .flush(), it'll emit whatever it's got,
// padded with nulls to 512 bytes.

module.exports = BlockStream

var Stream = require("stream").Stream
  , inherits = require("inherits")
  , assert = require("assert").ok
  , debug = process.env.DEBUG ? console.error : function () {}

function BlockStream (size, opt) {
  this.writable = this.readable = true
  this._opt = opt || {}
  this._chunkSize = size || 512
  this._offset = 0
  this._buffer = []
  this._bufferLength = 0
  if (this._opt.nopad) this._zeroes = false
  else {
    this._zeroes = new Buffer(this._chunkSize)
    for (var i = 0; i < this._chunkSize; i ++) {
      this._zeroes[i] = 0
    }
  }
}

inherits(BlockStream, Stream)

BlockStream.prototype.write = function (c) {
  // debug("   BS write", c)
  if (this._ended) throw new Error("BlockStream: write after end")
  if (c && !Buffer.isBuffer(c)) c = new Buffer(c + "")
  if (c.length) {
    this._buffer.push(c)
    this._bufferLength += c.length
  }
  // debug("pushed onto buffer", this._bufferLength)
  if (this._bufferLength >= this._chunkSize) {
    if (this._paused) {
      // debug("   BS paused, return false, need drain")
      this._needDrain = true
      return false
    }
    this._emitChunk()
  }
  return true
}

BlockStream.prototype.pause = function () {
  // debug("   BS pausing")
  this._paused = true
}

BlockStream.prototype.resume = function () {
  // debug("   BS resume")
  this._paused = false
  return this._emitChunk()
}

BlockStream.prototype.end = function (chunk) {
  // debug("end", chunk)
  if (typeof chunk === "function") cb = chunk, chunk = null
  if (chunk) this.write(chunk)
  this._ended = true
  this.flush()
}

BlockStream.prototype.flush = function () {
  this._emitChunk(true)
}

BlockStream.prototype._emitChunk = function (flush) {
  // debug("emitChunk flush=%j emitting=%j paused=%j", flush, this._emitting, this._paused)

  // emit a <chunkSize> chunk
  if (flush && this._zeroes) {
    // debug("    BS push zeroes", this._bufferLength)
    // push a chunk of zeroes
    var padBytes = (this._bufferLength % this._chunkSize)
    if (padBytes !== 0) padBytes = this._chunkSize - padBytes
    if (padBytes > 0) {
      // debug("padBytes", padBytes, this._zeroes.slice(0, padBytes))
      this._buffer.push(this._zeroes.slice(0, padBytes))
      this._bufferLength += padBytes
      // debug(this._buffer[this._buffer.length - 1].length, this._bufferLength)
    }
  }

  if (this._emitting || this._paused) return
  this._emitting = true

  // debug("    BS entering loops")
  var bufferIndex = 0
  while (this._bufferLength >= this._chunkSize &&
         (flush || !this._paused)) {
    // debug("     BS data emission loop", this._bufferLength)

    var out
      , outOffset = 0
      , outHas = this._chunkSize

    while (outHas > 0 && (flush || !this._paused) ) {
      // debug("    BS data inner emit loop", this._bufferLength)
      var cur = this._buffer[bufferIndex]
        , curHas = cur.length - this._offset
      // debug("cur=", cur)
      // debug("curHas=%j", curHas)
      // If it's not big enough to fill the whole thing, then we'll need
      // to copy multiple buffers into one.  However, if it is big enough,
      // then just slice out the part we want, to save unnecessary copying.
      // Also, need to copy if we've already done some copying, since buffers
      // can't be joined like cons strings.
      if (out || curHas < outHas) {
        out = out || new Buffer(this._chunkSize)
        cur.copy(out, outOffset,
                 this._offset, this._offset + Math.min(curHas, outHas))
      } else if (cur.length === outHas && this._offset === 0) {
        // shortcut -- cur is exactly long enough, and no offset.
        out = cur
      } else {
        // slice out the piece of cur that we need.
        out = cur.slice(this._offset, this._offset + outHas)
      }

      if (curHas > outHas) {
        // means that the current buffer couldn't be completely output
        // update this._offset to reflect how much WAS written
        this._offset += outHas
        outHas = 0
      } else {
        // output the entire current chunk.
        // toss it away
        outHas -= curHas
        outOffset += curHas
        bufferIndex ++
        this._offset = 0
      }
    }

    this._bufferLength -= this._chunkSize
    assert(out.length === this._chunkSize)
    // debug("emitting data", out)
    // debug("   BS emitting, paused=%j", this._paused, this._bufferLength)
    this.emit("data", out)
    out = null
  }
  // debug("    BS out of loops", this._bufferLength)

  // whatever is left, it's not enough to fill up a block, or we're paused
  this._buffer = this._buffer.slice(bufferIndex)
  if (this._paused) {
    // debug("    BS paused, leaving", this._bufferLength)
    this._needsDrain = true
    this._emitting = false
    return
  }

  // if flushing, and not using null-padding, then need to emit the last
  // chunk(s) sitting in the queue.  We know that it's not enough to
  // fill up a whole block, because otherwise it would have been emitted
  // above, but there may be some offset.
  var l = this._buffer.length
  if (flush && !this._zeroes && l) {
    if (l === 1) {
      if (this._offset) {
        this.emit("data", this._buffer[0].slice(this._offset))
      } else {
        this.emit("data", this._buffer[0])
      }
    } else {
      var outHas = this._bufferLength
        , out = new Buffer(outHas)
        , outOffset = 0
      for (var i = 0; i < l; i ++) {
        var cur = this._buffer[i]
          , curHas = cur.length - this._offset
        cur.copy(out, outOffset, this._offset)
        this._offset = 0
        outOffset += curHas
        this._bufferLength -= curHas
      }
      this.emit("data", out)
    }
    // truncate
    this._buffer.length = 0
    this._bufferLength = 0
    this._offset = 0
  }

  // now either drained or ended
  // debug("either draining, or ended", this._bufferLength, this._ended)
  // means that we've flushed out all that we can so far.
  if (this._needDrain) {
    // debug("emitting drain", this._bufferLength)
    this._needDrain = false
    this.emit("drain")
  }

  if ((this._bufferLength === 0) && this._ended && !this._endEmitted) {
    // debug("emitting end", this._bufferLength)
    this._endEmitted = true
    this.emit("end")
  }

  this._emitting = false

  // debug("    BS no longer emitting", flush, this._paused, this._emitting, this._bufferLength, this._chunkSize)
}

}).call(this,require('_process'),require("buffer").Buffer)

},{"_process":80,"assert":70,"buffer":72,"inherits":29,"stream":92}],10:[function(require,module,exports){
(function (process,Buffer){
/*global FileList */

module.exports = createTorrent

module.exports.announceList = [
  [ 'udp://tracker.publicbt.com:80' ],
  [ 'udp://tracker.openbittorrent.com:80' ],
  [ 'udp://open.demonii.com:1337' ],
  [ 'udp://tracker.webtorrent.io:80' ],
  [ 'wss://tracker.webtorrent.io' ] // For WebRTC peers (see: WebTorrent.io)
]

module.exports.parseInput = parseInput

var bencode = require('bencode')
var BlockStream = require('block-stream')
var calcPieceLength = require('piece-length')
var corePath = require('path')
var FileReadStream = require('filestream/read')
var flatten = require('flatten')
var fs = require('fs')
var MultiStream = require('multistream')
var once = require('once')
var parallel = require('run-parallel')
var sha1 = require('simple-sha1')
var stream = require('stream')
var Transform = stream.Transform

/**
 * Create a torrent.
 * @param  {string|File|FileList|Buffer|Stream|Array.<string|File|Buffer|Stream>} input
 * @param  {Object} opts
 * @param  {string=} opts.name
 * @param  {Date=} opts.creationDate
 * @param  {string=} opts.comment
 * @param  {string=} opts.createdBy
 * @param  {boolean|number=} opts.private
 * @param  {number=} opts.pieceLength
 * @param  {Array.<Array.<string>>=} opts.announceList
 * @param  {Array.<string>=} opts.urlList
 * @param  {function} cb
 * @return {Buffer} buffer of .torrent file data
 */
function createTorrent (input, opts, cb) {
  if (typeof opts === 'function') {
    cb = opts
    opts = {}
  }
  if (!opts) opts = {}
  parseInput(input, opts, function (err, files) {
    if (err) return cb(err)
    onFiles(files, opts, cb)
  })
}

function parseInput (input, opts, cb) {
  if (typeof opts === 'function') {
    cb = opts
    opts = {}
  }
  if (!opts) opts = {}

  if (isFileList(input))
    input = Array.prototype.slice.call(input)
  if (!Array.isArray(input))
    input = [ input ]

  if (input.length === 0) throw new Error('invalid input type')

  if (!opts.name)
    opts.name = input[0].name || (typeof input[0] === 'string' && corePath.basename(input))
  if (opts.name === undefined)
    throw new Error('missing option \'name\' and unable to infer it from input[0].name')

  // If there's just one file, allow the name to be set by `opts.name`
  if (input.length === 1 && !input[0].name) input[0].name = opts.name

  var numPaths = input.reduce(function (sum, item) {
    return sum + Number(typeof item === 'string')
  }, 0)

  parallel(input.map(function (item) {
    return function (cb) {
      var file = {}

      if (isBlob(item)) {
        file.getStream = getBlobStream(item)
        file.length = item.size
      } else if (Buffer.isBuffer(item)) {
        file.getStream = getBufferStream(item)
        file.length = item.length
      } else if (isReadable(item)) {
        if (!opts.pieceLength)
          throw new Error('must specify `pieceLength` option if input is Stream')
        file.getStream = getStreamStream(item, file)
        file.length = 0
      } else if (typeof item === 'string') {
        var keepRoot = numPaths > 1
        getFiles(item, keepRoot, cb)
        return // early return!
      } else {
        throw new Error('invalid input type in array')
      }
      if (!item.name) throw new Error('missing requied `name` property on input')
      file.path = item.name.split(corePath.sep)
      cb(null, file)
    }
  }), function (err, files) {
    if (err) return cb(err)
    files = flatten(files)

    if (numPaths === 0) process.nextTick(function () {
      cb(null, files) // dezalgo
    })
    else cb(null, files)
  })
}

function getFiles (path, keepRoot, cb) {
  traversePath(getFileInfo, path, function (err, files) {
      if (err) return cb(err)

      if (Array.isArray(files)) files = flatten(files)
      else files = [ files ]

      var dirName = corePath.normalize(path)
      if (keepRoot || files.length === 1) {
        dirName = dirName.slice(0, dirName.lastIndexOf(corePath.sep) + 1)
      } else {
        if (dirName[dirName.length - 1] !== corePath.sep) dirName += corePath.sep
      }

      files.forEach(function (file) {
        file.getStream = getFilePathStream(file.path)
        file.path = file.path.replace(dirName, '').split(corePath.sep)
      })

      cb(null, files)
    })
}

function getFileInfo (path, cb) {
  cb = once(cb)
  fs.stat(path, function (err, stat) {
    if (err) return cb(err)
    var info = {
      length: stat.size,
      path: path
    }
    cb(null, info)
  })
}

function traversePath (fn, path, cb) {
  fs.readdir(path, function (err, entries) {
    if (err && err.code === 'ENOTDIR') {
      // this is a file
      fn(path, cb)
    } else if (err) {
      // real error
      cb(err)
    } else {
      // this is a folder
      parallel(entries.map(function (entry) {
        return function (cb) {
          traversePath(fn, corePath.join(path, entry), cb)
        }
      }), cb)
    }
  })
}

function getPieceList (files, pieceLength, cb) {
  cb = once(cb)
  var pieces = []
  var length = 0

  var streams = files.map(function (file) {
    return file.getStream
  })

  var remainingHashes = 0
  var pieceNum = 0
  var ended = false

  new MultiStream(streams)
    .pipe(new BlockStream(pieceLength, { nopad: true }))
    .on('data', function (chunk) {
      length += chunk.length

      var i = pieceNum
      sha1(chunk, function (hash) {
        pieces[i] = hash
        remainingHashes -= 1
        maybeDone()
      })
      remainingHashes += 1
      pieceNum += 1
    })
    .on('end', function () {
      ended = true
      maybeDone()
    })
    .on('error', cb)

  function maybeDone () {
    if (ended && remainingHashes === 0)
      cb(null, new Buffer(pieces.join(''), 'hex'), length)
  }
}

function onFiles (files, opts, cb) {
  var announceList = opts.announceList !== undefined
    ? opts.announceList
    : opts.announce !== undefined
      ? opts.announce.map(function (u) { return [ u ] })
      : module.exports.announceList // default

  var torrent = {
    info: {
      name: opts.name
    },
    announce: announceList[0][0],
    'announce-list': announceList,
    'creation date': Number(opts.creationDate) || Date.now(),
    encoding: 'UTF-8'
  }

  if (opts.comment !== undefined)
    torrent.info.comment = opts.comment

  if (opts.createdBy !== undefined)
    torrent.info['created by'] = opts.createdBy

  if (opts.private !== undefined)
    torrent.info.private = Number(opts.private)

  // "ssl-cert" key is for SSL torrents, see:
  //   - http://blog.libtorrent.org/2012/01/bittorrent-over-ssl/
  //   - http://www.libtorrent.org/manual-ref.html#ssl-torrents
  //   - http://www.libtorrent.org/reference-Create_Torrents.html
  if (opts.sslCert !== undefined)
    torrent.info['ssl-cert'] = opts.sslCert

  if (opts.urlList !== undefined)
    torrent['url-list'] = opts.urlList

  var singleFile = files.length === 1

  var pieceLength = opts.pieceLength || calcPieceLength(files.reduce(sumLength, 0))
  torrent.info['piece length'] = pieceLength

  getPieceList(files, pieceLength, function (err, pieces, torrentLength) {
    if (err) return cb(err)
    torrent.info.pieces = pieces

    files.forEach(function (file) {
      delete file.getStream
    })

    if (!singleFile) {
      torrent.info.files = files
    } else {
      torrent.info.length = torrentLength
    }

    cb(null, bencode.encode(torrent))
  })
}

/**
 * Accumulator to sum file lengths
 * @param  {number} sum
 * @param  {Object} file
 * @return {number}
 */
function sumLength (sum, file) {
  return sum + file.length
}

/**
 * Check if `obj` is a W3C `Blob` object (which `File` inherits from)
 * @param  {*} obj
 * @return {boolean}
 */
function isBlob (obj) {
  return typeof Blob !== 'undefined' && obj instanceof Blob
}

/**
 * Check if `obj` is a W3C `FileList` object
 * @param  {*} obj
 * @return {boolean}
 */
function isFileList (obj) {
  return typeof FileList === 'function' && obj instanceof FileList
}

/**
 * Check if `obj` is a node Readable stream
 * @param  {*} obj
 * @return {boolean}
 */
function isReadable (obj) {
  return typeof obj === 'object' && typeof obj.pipe === 'function'
}

/**
 * Convert a `File` to a lazy readable stream.
 * @param  {File|Blob} file
 * @return {function}
 */
function getBlobStream (file) {
  return function () {
    return new FileReadStream(file)
  }
}

/**
 * Convert a `Buffer` to a lazy readable stream.
 * @param  {Buffer} buffer
 * @return {function}
 */
function getBufferStream (buffer) {
  return function () {
    var s = new stream.PassThrough()
    s.end(buffer)
    return s
  }
}

/**
 * Convert a file path to a lazy readable stream.
 * @param  {string} path
 * @return {function}
 */
function getFilePathStream (path) {
  return function () {
    return fs.createReadStream(path)
  }
}

/**
 * Convert a readable stream to a lazy readable stream. Adds instrumentation to track
 * the number of bytes in the stream and set `file.length`.
 *
 * @param  {Stream} stream
 * @param  {Object} file
 * @return {function}
 */
function getStreamStream (stream, file) {
  return function () {
    var counter = new Transform()
    counter._transform = function (buf, enc, done) {
      file.length += buf.length
      this.push(buf)
      done()
    }
    stream.pipe(counter)
    return counter
  }
}

}).call(this,require('_process'),require("buffer").Buffer)

},{"_process":80,"bencode":11,"block-stream":9,"buffer":72,"filestream/read":17,"flatten":18,"fs":69,"multistream":30,"once":32,"path":79,"piece-length":19,"run-parallel":44,"simple-sha1":45,"stream":92}],11:[function(require,module,exports){
module.exports = {
  encode: require( './lib/encode' ),
  decode: require( './lib/decode' )
}

},{"./lib/decode":12,"./lib/encode":14}],12:[function(require,module,exports){
(function (Buffer){
var Dict = require("./dict")

/**
 * Decodes bencoded data.
 *
 * @param  {Buffer} data
 * @param  {String} encoding
 * @return {Object|Array|Buffer|String|Number}
 */
function decode( data, encoding ) {

  decode.position = 0
  decode.encoding = encoding || null

  decode.data = !( Buffer.isBuffer(data) )
    ? new Buffer( data )
    : data

  return decode.next()

}

decode.position = 0
decode.data     = null
decode.encoding = null

decode.next = function() {

  switch( decode.data[decode.position] ) {
    case 0x64: return decode.dictionary(); break
    case 0x6C: return decode.list(); break
    case 0x69: return decode.integer(); break
    default:   return decode.bytes(); break
  }

}

decode.find = function( chr ) {

  var i = decode.position
  var c = decode.data.length
  var d = decode.data

  while( i < c ) {
    if( d[i] === chr )
      return i
    i++
  }

  throw new Error(
    'Invalid data: Missing delimiter "' +
    String.fromCharCode( chr ) + '" [0x' +
    chr.toString( 16 ) + ']'
  )

}

decode.dictionary = function() {

  decode.position++

  var dict = new Dict()

  while( decode.data[decode.position] !== 0x65 ) {
    dict.binarySet(decode.bytes(), decode.next())
  }

  decode.position++

  return dict

}

decode.list = function() {

  decode.position++

  var lst = []

  while( decode.data[decode.position] !== 0x65 ) {
    lst.push( decode.next() )
  }

  decode.position++

  return lst

}

decode.integer = function() {

  var end    = decode.find( 0x65 )
  var number = decode.data.toString( 'ascii', decode.position + 1, end )

  decode.position += end + 1 - decode.position

  return parseInt( number, 10 )

}

decode.bytes = function() {

  var sep    = decode.find( 0x3A )
  var length = parseInt( decode.data.toString( 'ascii', decode.position, sep ), 10 )
  var end    = ++sep + length

  decode.position = end

  return decode.encoding
    ? decode.data.toString( decode.encoding, sep, end )
    : decode.data.slice( sep, end )

}

// Exports
module.exports = decode

}).call(this,require("buffer").Buffer)

},{"./dict":13,"buffer":72}],13:[function(require,module,exports){
var Dict = module.exports = function Dict() {
  Object.defineProperty(this, "_keys", {
    enumerable: false,
    value: [],
  })
}

Dict.prototype.binaryKeys = function binaryKeys() {
  return this._keys.slice()
}

Dict.prototype.binarySet = function binarySet(key, value) {
  this._keys.push(key)

  this[key] = value
}

},{}],14:[function(require,module,exports){
(function (Buffer){
/**
 * Encodes data in bencode.
 *
 * @param  {Buffer|Array|String|Object|Number} data
 * @return {Buffer}
 */
function encode( data ) {
  var buffers = []
  encode._encode( buffers, data )
  return Buffer.concat( buffers )
}

encode._floatConversionDetected = false

encode._encode = function( buffers, data ) {

  if( Buffer.isBuffer(data) ) {
    buffers.push(new Buffer(data.length + ':'))
    buffers.push(data)
    return;
  }

  switch( typeof data ) {
    case 'string':
      encode.bytes( buffers, data )
      break
    case 'number':
      encode.number( buffers, data )
      break
    case 'object':
      data.constructor === Array
        ? encode.list( buffers, data )
        : encode.dict( buffers, data )
      break
  }

}

var buff_e = new Buffer('e')
  , buff_d = new Buffer('d')
  , buff_l = new Buffer('l')

encode.bytes = function( buffers, data ) {

  buffers.push( new Buffer(Buffer.byteLength( data ) + ':' + data) )
}

encode.number = function( buffers, data ) {
  var maxLo = 0x80000000
  var hi = ( data / maxLo ) << 0
  var lo = ( data % maxLo  ) << 0
  var val = hi * maxLo + lo

  buffers.push( new Buffer( 'i' + val + 'e' ))

  if( val !== data && !encode._floatConversionDetected ) {
    encode._floatConversionDetected = true
    console.warn(
      'WARNING: Possible data corruption detected with value "'+data+'":',
      'Bencoding only defines support for integers, value was converted to "'+val+'"'
    )
    console.trace()
  }

}

encode.dict = function( buffers, data ) {

  buffers.push( buff_d )

  var j = 0
  var k
  // fix for issue #13 - sorted dicts
  var keys = Object.keys( data ).sort()
  var kl = keys.length

  for( ; j < kl ; j++) {
    k=keys[j]
    encode.bytes( buffers, k )
    encode._encode( buffers, data[k] )
  }

  buffers.push( buff_e )
}

encode.list = function( buffers, data ) {

  var i = 0, j = 1
  var c = data.length
  buffers.push( buff_l )

  for( ; i < c; i++ ) {
    encode._encode( buffers, data[i] )
  }

  buffers.push( buff_e )

}

// Expose
module.exports = encode

}).call(this,require("buffer").Buffer)

},{"buffer":72}],15:[function(require,module,exports){
(function (Buffer){
/**
 * Convert a typed array to a Buffer without a copy
 *
 * Author:   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * License:  MIT
 *
 * `npm install typedarray-to-buffer`
 */

var isTypedArray = require('is-typedarray').strict

module.exports = function (arr) {
  // If `Buffer` is the browser `buffer` module, and the browser supports typed arrays,
  // then avoid a copy. Otherwise, create a `Buffer` with a copy.
  var constructor = Buffer.TYPED_ARRAY_SUPPORT
    ? Buffer._augment
    : function (arr) { return new Buffer(arr) }

  if (arr instanceof Uint8Array) {
    return constructor(arr)
  } else if (arr instanceof ArrayBuffer) {
    return constructor(new Uint8Array(arr))
  } else if (isTypedArray(arr)) {
    // Use the typed array's underlying ArrayBuffer to back new Buffer. This respects
    // the "view" on the ArrayBuffer, i.e. byteOffset and byteLength. No copy.
    return constructor(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength))
  } else {
    // Unsupported type, just pass it through to the `Buffer` constructor.
    return new Buffer(arr)
  }
}

}).call(this,require("buffer").Buffer)

},{"buffer":72,"is-typedarray":16}],16:[function(require,module,exports){
module.exports      = isTypedArray
isTypedArray.strict = isStrictTypedArray
isTypedArray.loose  = isLooseTypedArray

var toString = Object.prototype.toString
var names = {
    '[object Int8Array]': true
  , '[object Int16Array]': true
  , '[object Int32Array]': true
  , '[object Uint8Array]': true
  , '[object Uint16Array]': true
  , '[object Uint32Array]': true
  , '[object Float32Array]': true
  , '[object Float64Array]': true
}

function isTypedArray(arr) {
  return (
       isStrictTypedArray(arr)
    || isLooseTypedArray(arr)
  )
}

function isStrictTypedArray(arr) {
  return (
       arr instanceof Int8Array
    || arr instanceof Int16Array
    || arr instanceof Int32Array
    || arr instanceof Uint8Array
    || arr instanceof Uint16Array
    || arr instanceof Uint32Array
    || arr instanceof Float32Array
    || arr instanceof Float64Array
  )
}

function isLooseTypedArray(arr) {
  return names[toString.call(arr)]
}

},{}],17:[function(require,module,exports){
var Readable = require('stream').Readable;
var inherits = require('inherits');
var reExtension = /^.*\.(\w+)$/;
var toBuffer = require('typedarray-to-buffer');

function FileReadStream(file, opts) {
  var readStream = this;
  if (! (this instanceof FileReadStream)) {
    return new FileReadStream(file, opts);
  }
  opts = opts || {};

  // inherit readable
  Readable.call(this, opts);

  // save the read offset
  this._offset = 0;
  this._eof = false;

  // create the reader
  this.reader = new FileReader();
  this.reader.onprogress = this._handleProgress.bind(this);
  this.reader.onload = this._handleLoad.bind(this);

  // generate the header blocks that we will send as part of the initial payload
  this._generateHeaderBlocks(file, opts, function(err, blocks) {
    // if we encountered an error, emit it
    if (err) {
      return readStream.emit('error', err);
    }

    readStream._headerBlocks = blocks || [];
    readStream.reader.readAsArrayBuffer(file);
  });
}

inherits(FileReadStream, Readable);
module.exports = FileReadStream;

FileReadStream.prototype._generateHeaderBlocks = function(file, opts, callback) {
  callback(null, []);
};

FileReadStream.prototype._read = function(bytes) {
  var stream = this;
  var reader = this.reader;

  function checkBytes() {
    var startOffset = stream._offset;
    var endOffset = stream._offset + bytes;
    var availableBytes = reader.result && reader.result.byteLength;
    var done = reader.readyState === 2 && endOffset > availableBytes;
    var chunk;

    // console.log('checking bytes available, need: ' + endOffset + ', got: ' + availableBytes);
    if (availableBytes && (done || availableBytes > endOffset)) {
      // get the data chunk
      chunk = toBuffer(new Uint8Array(
        reader.result,
        startOffset,
        Math.min(bytes, reader.result.byteLength - startOffset)
      ));

      // update the stream offset
      stream._offset = startOffset + chunk.length;

      // send the chunk
      // console.log('sending chunk, ended: ', chunk.length === 0);
      stream._eof = chunk.length === 0;
      return stream.push(chunk.length > 0 ? chunk : null);
    }

    stream.once('readable', checkBytes);
  }

  // push the header blocks out to the stream
  if (this._headerBlocks.length > 0) {
    return this.push(this._headerBlocks.shift());
  }

  checkBytes();
};

FileReadStream.prototype._handleLoad = function(evt) {
  this.emit('readable');
};

FileReadStream.prototype._handleProgress = function(evt) {
  this.emit('readable');
};

},{"inherits":29,"stream":92,"typedarray-to-buffer":15}],18:[function(require,module,exports){
module.exports = function flatten(list, depth) {
  depth = (typeof depth == 'number') ? depth : Infinity;

  return _flatten(list, 1);

  function _flatten(list, d) {
    return list.reduce(function (acc, item) {
      if (Array.isArray(item) && d < depth) {
        return acc.concat(_flatten(item, d + 1));
      }
      else {
        return acc.concat(item);
      }
    }, []);
  }
};

},{}],19:[function(require,module,exports){
var closest = require('closest-to')

// Create a range from 16kb–4mb
var sizes = []
for (var i = 14; i <= 22; i++) {
  sizes.push(Math.pow(2, i))
}

module.exports = function(size) {
  return closest(
    size / Math.pow(2, 10), sizes 
  )
}

},{"closest-to":20}],20:[function(require,module,exports){
module.exports = function(target, numbers) {
  var closest = Infinity
  var difference = 0
  var winner = null

  numbers.sort(function(a, b) {
    return a - b
  })

  for (var i = 0, l = numbers.length; i < l; i++) {  
    difference = Math.abs(target - numbers[i])
    if (difference >= closest) {
      break
    }
    closest = difference
    winner = numbers[i]
  }

  return winner
}

},{}],21:[function(require,module,exports){

/**
 * This is the web browser implementation of `debug()`.
 *
 * Expose `debug()` as the module.
 */

exports = module.exports = require('./debug');
exports.log = log;
exports.formatArgs = formatArgs;
exports.save = save;
exports.load = load;
exports.useColors = useColors;

/**
 * Use chrome.storage.local if we are in an app
 */

var storage;

if (typeof chrome !== 'undefined' && typeof chrome.storage !== 'undefined')
  storage = chrome.storage.local;
else
  storage = localstorage();

/**
 * Colors.
 */

exports.colors = [
  'lightseagreen',
  'forestgreen',
  'goldenrod',
  'dodgerblue',
  'darkorchid',
  'crimson'
];

/**
 * Currently only WebKit-based Web Inspectors, Firefox >= v31,
 * and the Firebug extension (any Firefox version) are known
 * to support "%c" CSS customizations.
 *
 * TODO: add a `localStorage` variable to explicitly enable/disable colors
 */

function useColors() {
  // is webkit? http://stackoverflow.com/a/16459606/376773
  return ('WebkitAppearance' in document.documentElement.style) ||
    // is firebug? http://stackoverflow.com/a/398120/376773
    (window.console && (console.firebug || (console.exception && console.table))) ||
    // is firefox >= v31?
    // https://developer.mozilla.org/en-US/docs/Tools/Web_Console#Styling_messages
    (navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/) && parseInt(RegExp.$1, 10) >= 31);
}

/**
 * Map %j to `JSON.stringify()`, since no Web Inspectors do that by default.
 */

exports.formatters.j = function(v) {
  return JSON.stringify(v);
};


/**
 * Colorize log arguments if enabled.
 *
 * @api public
 */

function formatArgs() {
  var args = arguments;
  var useColors = this.useColors;

  args[0] = (useColors ? '%c' : '')
    + this.namespace
    + (useColors ? ' %c' : ' ')
    + args[0]
    + (useColors ? '%c ' : ' ')
    + '+' + exports.humanize(this.diff);

  if (!useColors) return args;

  var c = 'color: ' + this.color;
  args = [args[0], c, 'color: inherit'].concat(Array.prototype.slice.call(args, 1));

  // the final "%c" is somewhat tricky, because there could be other
  // arguments passed either before or after the %c, so we need to
  // figure out the correct index to insert the CSS into
  var index = 0;
  var lastC = 0;
  args[0].replace(/%[a-z%]/g, function(match) {
    if ('%%' === match) return;
    index++;
    if ('%c' === match) {
      // we only are interested in the *last* %c
      // (the user may have provided their own)
      lastC = index;
    }
  });

  args.splice(lastC, 0, c);
  return args;
}

/**
 * Invokes `console.log()` when available.
 * No-op when `console.log` is not a "function".
 *
 * @api public
 */

function log() {
  // this hackery is required for IE8/9, where
  // the `console.log` function doesn't have 'apply'
  return 'object' === typeof console
    && console.log
    && Function.prototype.apply.call(console.log, console, arguments);
}

/**
 * Save `namespaces`.
 *
 * @param {String} namespaces
 * @api private
 */

function save(namespaces) {
  try {
    if (null == namespaces) {
      storage.removeItem('debug');
    } else {
      storage.debug = namespaces;
    }
  } catch(e) {}
}

/**
 * Load `namespaces`.
 *
 * @return {String} returns the previously persisted debug modes
 * @api private
 */

function load() {
  var r;
  try {
    r = storage.debug;
  } catch(e) {}
  return r;
}

/**
 * Enable namespaces listed in `localStorage.debug` initially.
 */

exports.enable(load());

/**
 * Localstorage attempts to return the localstorage.
 *
 * This is necessary because safari throws
 * when a user disables cookies/localstorage
 * and you attempt to access it.
 *
 * @return {LocalStorage}
 * @api private
 */

function localstorage(){
  try {
    return window.localStorage;
  } catch (e) {}
}

},{"./debug":22}],22:[function(require,module,exports){

/**
 * This is the common logic for both the Node.js and web browser
 * implementations of `debug()`.
 *
 * Expose `debug()` as the module.
 */

exports = module.exports = debug;
exports.coerce = coerce;
exports.disable = disable;
exports.enable = enable;
exports.enabled = enabled;
exports.humanize = require('ms');

/**
 * The currently active debug mode names, and names to skip.
 */

exports.names = [];
exports.skips = [];

/**
 * Map of special "%n" handling functions, for the debug "format" argument.
 *
 * Valid key names are a single, lowercased letter, i.e. "n".
 */

exports.formatters = {};

/**
 * Previously assigned color.
 */

var prevColor = 0;

/**
 * Previous log timestamp.
 */

var prevTime;

/**
 * Select a color.
 *
 * @return {Number}
 * @api private
 */

function selectColor() {
  return exports.colors[prevColor++ % exports.colors.length];
}

/**
 * Create a debugger with the given `namespace`.
 *
 * @param {String} namespace
 * @return {Function}
 * @api public
 */

function debug(namespace) {

  // define the `disabled` version
  function disabled() {
  }
  disabled.enabled = false;

  // define the `enabled` version
  function enabled() {

    var self = enabled;

    // set `diff` timestamp
    var curr = +new Date();
    var ms = curr - (prevTime || curr);
    self.diff = ms;
    self.prev = prevTime;
    self.curr = curr;
    prevTime = curr;

    // add the `color` if not set
    if (null == self.useColors) self.useColors = exports.useColors();
    if (null == self.color && self.useColors) self.color = selectColor();

    var args = Array.prototype.slice.call(arguments);

    args[0] = exports.coerce(args[0]);

    if ('string' !== typeof args[0]) {
      // anything else let's inspect with %o
      args = ['%o'].concat(args);
    }

    // apply any `formatters` transformations
    var index = 0;
    args[0] = args[0].replace(/%([a-z%])/g, function(match, format) {
      // if we encounter an escaped % then don't increase the array index
      if (match === '%%') return match;
      index++;
      var formatter = exports.formatters[format];
      if ('function' === typeof formatter) {
        var val = args[index];
        match = formatter.call(self, val);

        // now we need to remove `args[index]` since it's inlined in the `format`
        args.splice(index, 1);
        index--;
      }
      return match;
    });

    if ('function' === typeof exports.formatArgs) {
      args = exports.formatArgs.apply(self, args);
    }
    var logFn = enabled.log || exports.log || console.log.bind(console);
    logFn.apply(self, args);
  }
  enabled.enabled = true;

  var fn = exports.enabled(namespace) ? enabled : disabled;

  fn.namespace = namespace;

  return fn;
}

/**
 * Enables a debug mode by namespaces. This can include modes
 * separated by a colon and wildcards.
 *
 * @param {String} namespaces
 * @api public
 */

function enable(namespaces) {
  exports.save(namespaces);

  var split = (namespaces || '').split(/[\s,]+/);
  var len = split.length;

  for (var i = 0; i < len; i++) {
    if (!split[i]) continue; // ignore empty strings
    namespaces = split[i].replace(/\*/g, '.*?');
    if (namespaces[0] === '-') {
      exports.skips.push(new RegExp('^' + namespaces.substr(1) + '$'));
    } else {
      exports.names.push(new RegExp('^' + namespaces + '$'));
    }
  }
}

/**
 * Disable debug output.
 *
 * @api public
 */

function disable() {
  exports.enable('');
}

/**
 * Returns true if the given mode name is enabled, false otherwise.
 *
 * @param {String} name
 * @return {Boolean}
 * @api public
 */

function enabled(name) {
  var i, len;
  for (i = 0, len = exports.skips.length; i < len; i++) {
    if (exports.skips[i].test(name)) {
      return false;
    }
  }
  for (i = 0, len = exports.names.length; i < len; i++) {
    if (exports.names[i].test(name)) {
      return true;
    }
  }
  return false;
}

/**
 * Coerce `val`.
 *
 * @param {Mixed} val
 * @return {Mixed}
 * @api private
 */

function coerce(val) {
  if (val instanceof Error) return val.stack || val.message;
  return val;
}

},{"ms":23}],23:[function(require,module,exports){
/**
 * Helpers.
 */

var s = 1000;
var m = s * 60;
var h = m * 60;
var d = h * 24;
var y = d * 365.25;

/**
 * Parse or format the given `val`.
 *
 * Options:
 *
 *  - `long` verbose formatting [false]
 *
 * @param {String|Number} val
 * @param {Object} options
 * @return {String|Number}
 * @api public
 */

module.exports = function(val, options){
  options = options || {};
  if ('string' == typeof val) return parse(val);
  return options.long
    ? long(val)
    : short(val);
};

/**
 * Parse the given `str` and return milliseconds.
 *
 * @param {String} str
 * @return {Number}
 * @api private
 */

function parse(str) {
  var match = /^((?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|years?|yrs?|y)?$/i.exec(str);
  if (!match) return;
  var n = parseFloat(match[1]);
  var type = (match[2] || 'ms').toLowerCase();
  switch (type) {
    case 'years':
    case 'year':
    case 'yrs':
    case 'yr':
    case 'y':
      return n * y;
    case 'days':
    case 'day':
    case 'd':
      return n * d;
    case 'hours':
    case 'hour':
    case 'hrs':
    case 'hr':
    case 'h':
      return n * h;
    case 'minutes':
    case 'minute':
    case 'mins':
    case 'min':
    case 'm':
      return n * m;
    case 'seconds':
    case 'second':
    case 'secs':
    case 'sec':
    case 's':
      return n * s;
    case 'milliseconds':
    case 'millisecond':
    case 'msecs':
    case 'msec':
    case 'ms':
      return n;
  }
}

/**
 * Short format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function short(ms) {
  if (ms >= d) return Math.round(ms / d) + 'd';
  if (ms >= h) return Math.round(ms / h) + 'h';
  if (ms >= m) return Math.round(ms / m) + 'm';
  if (ms >= s) return Math.round(ms / s) + 's';
  return ms + 'ms';
}

/**
 * Long format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function long(ms) {
  return plural(ms, d, 'day')
    || plural(ms, h, 'hour')
    || plural(ms, m, 'minute')
    || plural(ms, s, 'second')
    || ms + ' ms';
}

/**
 * Pluralization helper.
 */

function plural(ms, n, name) {
  if (ms < n) return;
  if (ms < n * 1.5) return Math.floor(ms / n) + ' ' + name;
  return Math.ceil(ms / n) + ' ' + name + 's';
}

},{}],24:[function(require,module,exports){
var wrappy = require('wrappy')
module.exports = wrappy(dezalgo)

var asap = require('asap')

function dezalgo (cb) {
  var sync = true
  asap(function () {
    sync = false
  })

  return function zalgoSafe() {
    var args = arguments
    var me = this
    if (sync)
      asap(function() {
        cb.apply(me, args)
      })
    else
      cb.apply(me, args)
  }
}

},{"asap":25,"wrappy":26}],25:[function(require,module,exports){
(function (process){

// Use the fastest possible means to execute a task in a future turn
// of the event loop.

// linked list of tasks (single, with head node)
var head = {task: void 0, next: null};
var tail = head;
var flushing = false;
var requestFlush = void 0;
var isNodeJS = false;

function flush() {
    /* jshint loopfunc: true */

    while (head.next) {
        head = head.next;
        var task = head.task;
        head.task = void 0;
        var domain = head.domain;

        if (domain) {
            head.domain = void 0;
            domain.enter();
        }

        try {
            task();

        } catch (e) {
            if (isNodeJS) {
                // In node, uncaught exceptions are considered fatal errors.
                // Re-throw them synchronously to interrupt flushing!

                // Ensure continuation if the uncaught exception is suppressed
                // listening "uncaughtException" events (as domains does).
                // Continue in next event to avoid tick recursion.
                if (domain) {
                    domain.exit();
                }
                setTimeout(flush, 0);
                if (domain) {
                    domain.enter();
                }

                throw e;

            } else {
                // In browsers, uncaught exceptions are not fatal.
                // Re-throw them asynchronously to avoid slow-downs.
                setTimeout(function() {
                   throw e;
                }, 0);
            }
        }

        if (domain) {
            domain.exit();
        }
    }

    flushing = false;
}

if (typeof process !== "undefined" && process.nextTick) {
    // Node.js before 0.9. Note that some fake-Node environments, like the
    // Mocha test runner, introduce a `process` global without a `nextTick`.
    isNodeJS = true;

    requestFlush = function () {
        process.nextTick(flush);
    };

} else if (typeof setImmediate === "function") {
    // In IE10, Node.js 0.9+, or https://github.com/NobleJS/setImmediate
    if (typeof window !== "undefined") {
        requestFlush = setImmediate.bind(window, flush);
    } else {
        requestFlush = function () {
            setImmediate(flush);
        };
    }

} else if (typeof MessageChannel !== "undefined") {
    // modern browsers
    // http://www.nonblocking.io/2011/06/windownexttick.html
    var channel = new MessageChannel();
    channel.port1.onmessage = flush;
    requestFlush = function () {
        channel.port2.postMessage(0);
    };

} else {
    // old browsers
    requestFlush = function () {
        setTimeout(flush, 0);
    };
}

function asap(task) {
    tail = tail.next = {
        task: task,
        domain: isNodeJS && process.domain,
        next: null
    };

    if (!flushing) {
        flushing = true;
        requestFlush();
    }
};

module.exports = asap;


}).call(this,require('_process'))

},{"_process":80}],26:[function(require,module,exports){
// Returns a wrapper function that returns a wrapped callback
// The wrapper function should do some stuff, and return a
// presumably different callback function.
// This makes sure that own properties are retained, so that
// decorations and such are not lost along the way.
module.exports = wrappy
function wrappy (fn, cb) {
  if (fn && cb) return wrappy(fn)(cb)

  if (typeof fn !== 'function')
    throw new TypeError('need wrapper function')

  Object.keys(fn).forEach(function (k) {
    wrapper[k] = fn[k]
  })

  return wrapper

  function wrapper() {
    var args = new Array(arguments.length)
    for (var i = 0; i < args.length; i++) {
      args[i] = arguments[i]
    }
    var ret = fn.apply(this, args)
    var cb = args[args.length-1]
    if (typeof ret === 'function' && ret !== cb) {
      Object.keys(cb).forEach(function (k) {
        ret[k] = cb[k]
      })
    }
    return ret
  }
}

},{}],27:[function(require,module,exports){
var once = require('once');

var noop = function() {};

var isRequest = function(stream) {
	return stream.setHeader && typeof stream.abort === 'function';
};

var isChildProcess = function(stream) {
	return stream.stdio && Array.isArray(stream.stdio) && stream.stdio.length === 3
};

var eos = function(stream, opts, callback) {
	if (typeof opts === 'function') return eos(stream, null, opts);
	if (!opts) opts = {};

	callback = once(callback || noop);

	var ws = stream._writableState;
	var rs = stream._readableState;
	var readable = opts.readable || (opts.readable !== false && stream.readable);
	var writable = opts.writable || (opts.writable !== false && stream.writable);

	var onlegacyfinish = function() {
		if (!stream.writable) onfinish();
	};

	var onfinish = function() {
		writable = false;
		if (!readable) callback();
	};

	var onend = function() {
		readable = false;
		if (!writable) callback();
	};

	var onexit = function(exitCode) {
		callback(exitCode ? new Error('exited with error code: ' + exitCode) : null);
	};

	var onclose = function() {
		if (readable && !(rs && rs.ended)) return callback(new Error('premature close'));
		if (writable && !(ws && ws.ended)) return callback(new Error('premature close'));
	};

	var onrequest = function() {
		stream.req.on('finish', onfinish);
	};

	if (isRequest(stream)) {
		stream.on('complete', onfinish);
		stream.on('abort', onclose);
		if (stream.req) onrequest();
		else stream.on('request', onrequest);
	} else if (writable && !ws) { // legacy streams
		stream.on('end', onlegacyfinish);
		stream.on('close', onlegacyfinish);
	}

	if (isChildProcess(stream)) stream.on('exit', onexit);

	stream.on('end', onend);
	stream.on('finish', onfinish);
	if (opts.error !== false) stream.on('error', callback);
	stream.on('close', onclose);

	return function() {
		stream.removeListener('complete', onfinish);
		stream.removeListener('abort', onclose);
		stream.removeListener('request', onrequest);
		if (stream.req) stream.req.removeListener('finish', onfinish);
		stream.removeListener('end', onlegacyfinish);
		stream.removeListener('close', onlegacyfinish);
		stream.removeListener('finish', onfinish);
		stream.removeListener('exit', onexit);
		stream.removeListener('end', onend);
		stream.removeListener('error', callback);
		stream.removeListener('close', onclose);
	};
};

module.exports = eos;
},{"once":32}],28:[function(require,module,exports){
var hat = module.exports = function (bits, base) {
    if (!base) base = 16;
    if (bits === undefined) bits = 128;
    if (bits <= 0) return '0';
    
    var digits = Math.log(Math.pow(2, bits)) / Math.log(base);
    for (var i = 2; digits === Infinity; i *= 2) {
        digits = Math.log(Math.pow(2, bits / i)) / Math.log(base) * i;
    }
    
    var rem = digits - Math.floor(digits);
    
    var res = '';
    
    for (var i = 0; i < Math.floor(digits); i++) {
        var x = Math.floor(Math.random() * base).toString(base);
        res = x + res;
    }
    
    if (rem) {
        var b = Math.pow(base, rem);
        var x = Math.floor(Math.random() * b).toString(base);
        res = x + res;
    }
    
    var parsed = parseInt(res, base);
    if (parsed !== Infinity && parsed >= Math.pow(2, bits)) {
        return hat(bits, base)
    }
    else return res;
};

hat.rack = function (bits, base, expandBy) {
    var fn = function (data) {
        var iters = 0;
        do {
            if (iters ++ > 10) {
                if (expandBy) bits += expandBy;
                else throw new Error('too many ID collisions, use more bits')
            }
            
            var id = hat(bits, base);
        } while (Object.hasOwnProperty.call(hats, id));
        
        hats[id] = data;
        return id;
    };
    var hats = fn.hats = {};
    
    fn.get = function (id) {
        return fn.hats[id];
    };
    
    fn.set = function (id, value) {
        fn.hats[id] = value;
        return fn;
    };
    
    fn.bits = bits || 128;
    fn.base = base || 16;
    return fn;
};

},{}],29:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    var TempCtor = function () {}
    TempCtor.prototype = superCtor.prototype
    ctor.prototype = new TempCtor()
    ctor.prototype.constructor = ctor
  }
}

},{}],30:[function(require,module,exports){
module.exports = MultiStream

var inherits = require('inherits')
var stream = require('stream')

inherits(MultiStream, stream.Readable)

function MultiStream (streams, opts) {
  if (!(this instanceof MultiStream)) return new MultiStream(streams, opts)
  stream.Readable.call(this, opts)

  this.destroyed = false

  this._drained = false
  this._forwarding = false
  this._current = null
  this._queue = streams.map(toStreams2)

  this._next()
}

MultiStream.obj = function (streams) {
  return new MultiStream(streams, { objectMode: true, highWaterMark: 16 })
}

MultiStream.prototype._read = function () {
  this._drained = true
  this._forward()
}

MultiStream.prototype._forward = function () {
  if (this._forwarding || !this._drained) return
  this._forwarding = true

  var chunk
  while ((chunk = this._current.read()) !== null) {
    this._drained = this.push(chunk)
  }

  this._forwarding = false
}

MultiStream.prototype.destroy = function (err) {
  if (this.destroyed) return
  this.destroyed = true
  
  if (this._current && this._current.destroy) this._current.destroy()
  this._queue.forEach(function (stream) {
    if (stream.destroy) stream.destroy()
  })

  if (err) this.emit('error', err)
  this.emit('close')
}

MultiStream.prototype._next = function () {
  var self = this
  var stream = this._queue.shift()

  if (typeof stream === 'function') stream = toStreams2(stream())

  if (!stream) {
    this.push(null)
    return
  }

  this._current = stream

  stream.on('readable', onReadable)
  stream.on('end', onEnd)
  stream.on('error', onError)
  stream.on('close', onClose)

  function onReadable () {
    self._forward()
  }

  function onClose () {
    if (!stream._readableState.ended) {
      self.destroy()
    }
  }

  function onEnd () {
    self._current = null
    stream.removeListener('readable', onReadable)
    stream.removeListener('end', onEnd)
    stream.removeListener('error', onError)
    stream.removeListener('close', onClose)
    self._next()
  }

  function onError (err) {
    self.destroy(err)
  }
}

function toStreams2 (s) {
  if (!s || typeof s === 'function' || s._readableState) return s

  var wrap = new stream.Readable().wrap(s)
  if (s.destroy) {
    wrap.destroy = s.destroy.bind(s)
  }
  return wrap
}

},{"inherits":29,"stream":92}],31:[function(require,module,exports){
arguments[4][26][0].apply(exports,arguments)
},{"dup":26}],32:[function(require,module,exports){
var wrappy = require('wrappy')
module.exports = wrappy(once)

once.proto = once(function () {
  Object.defineProperty(Function.prototype, 'once', {
    value: function () {
      return once(this)
    },
    configurable: true
  })
})

function once (fn) {
  var f = function () {
    if (f.called) return f.value
    f.called = true
    return f.value = fn.apply(this, arguments)
  }
  f.called = false
  return f
}

},{"wrappy":31}],33:[function(require,module,exports){
(function (Buffer){
var magnet = require('magnet-uri')
var parseTorrentFile = require('parse-torrent-file')

/**
 * Parse a torrent identifier (magnet uri, .torrent file, info hash)
 * @param  {string|Buffer|Object} torrentId
 * @return {Object}
 */
module.exports = function parseTorrent (torrentId) {
  var len = torrentId && torrentId.length
  if (typeof torrentId === 'string' && /magnet:/.test(torrentId)) {
    // magnet uri (string)
    return magnet(torrentId)
  } else if (typeof torrentId === 'string' && (len === 40 || len === 32)) {
    // info hash (hex/base-32 string)
    return magnet('magnet:?xt=urn:btih:' + torrentId)
  } else if (Buffer.isBuffer(torrentId) && len === 20) {
    // info hash (buffer)
    return { infoHash: torrentId.toString('hex') }
  } else if (Buffer.isBuffer(torrentId)) {
    // .torrent file (buffer)
    return parseTorrentFile(torrentId) // might throw
  } else if (torrentId && torrentId.infoHash) {
    // parsed torrent (from `parse-torrent`, `parse-torrent-file`, or `magnet-uri`)
    return torrentId
  } else {
    throw new Error('Invalid torrent identifier')
  }
}

module.exports.toMagnetURI = magnet.encode
module.exports.toTorrentFile = parseTorrentFile.encode

}).call(this,require("buffer").Buffer)

},{"buffer":72,"magnet-uri":34,"parse-torrent-file":38}],34:[function(require,module,exports){
(function (Buffer){
module.exports = magnetURIDecode
module.exports.decode = magnetURIDecode
module.exports.encode = magnetURIEncode

var base32 = require('thirty-two')
var extend = require('xtend')
var flatten = require('flatten')

/**
 * Parse a magnet URI and return an object of keys/values
 *
 * @param  {string} uri
 * @return {Object} parsed uri
 */
function magnetURIDecode (uri) {
  var result = {}
  var data = uri.split('magnet:?')[1]

  var params = (data && data.length >= 0)
    ? data.split('&')
    : []

  params.forEach(function (param) {
    var keyval = param.split('=')

    // This keyval is invalid, skip it
    if (keyval.length !== 2) return

    var key = keyval[0]
    var val = keyval[1]

    // Clean up torrent name
    if (key === 'dn') val = decodeURIComponent(val).replace(/\+/g, ' ')

    // Address tracker (tr), exact source (xs), and acceptable source (as) are encoded
    // URIs, so decode them
    if (key === 'tr' || key === 'xs' || key === 'as' || key === 'ws')
      val = decodeURIComponent(val)

    // Return keywords as an array
    if (key === 'kt') val = decodeURIComponent(val).split('+')

    // If there are repeated parameters, return an array of values
    if (result[key]) {
      if (Array.isArray(result[key])) {
        result[key].push(val)
      } else {
        var old = result[key]
        result[key] = [old, val]
      }
    } else {
      result[key] = val
    }
  })

  // Convenience properties for parity with `parse-torrent-file` module
  var m
  if (result.xt) {
    var xts = Array.isArray(result.xt) ? result.xt : [ result.xt ]
    xts.forEach(function (xt) {
      if ((m = xt.match(/^urn:btih:(.{40})/))) {
        result.infoHash = new Buffer(m[1], 'hex').toString('hex')
      } else if ((m = xt.match(/^urn:btih:(.{32})/))) {
        var decodedStr = base32.decode(m[1])
        result.infoHash = new Buffer(decodedStr, 'binary').toString('hex')
      }
    })
  }

  if (result.dn) result.name = result.dn
  if (result.kt) result.keywords = result.kt

  if (typeof result.tr === 'string') result.announce = [ result.tr ]
  else if (Array.isArray(result.tr)) result.announce = result.tr
  else result.announce = []

  result.announceList = result.announce.map(function (url) {
    return [ url ]
  })

  result.urlList = []
  if (typeof result.as === 'string' || Array.isArray(result.as))
    result.urlList = result.urlList.concat(result.as)
  if (typeof result.ws === 'string' || Array.isArray(result.ws))
    result.urlList = result.urlList.concat(result.ws)

  return result
}

function magnetURIEncode (obj) {
  obj = extend(obj) // clone obj, so we can mutate it

  // support official magnet key names and convenience names
  // (example: `infoHash` for `xt`, `name` for `dn`)
  if (obj.infoHash) obj.xt = 'urn:btih:' + obj.infoHash
  if (obj.name) obj.dn = obj.name
  if (obj.keywords) obj.kt = obj.keywords
  if (obj.announce) obj.tr = obj.announce
  if (obj.announceList) obj.tr = flatten(obj.announceList)
  if (obj.urlList) {
    obj.ws = flatten(obj.urlList)
    delete obj.as
  }

  var result = 'magnet:?'
  Object.keys(obj)
    .filter(function (key) {
      return key.length === 2
    })
    .forEach(function (key, i) {
      var values = Array.isArray(obj[key]) ? obj[key] : [ obj[key] ]
      values.forEach(function (val, j) {
        if ((i > 0 || j > 0) && (key !== 'kt' || j === 0)) result += '&'

        if (key === 'dn') val = encodeURIComponent(val).replace(/%20/g, '+')
        if (key === 'tr' || key === 'xs' || key === 'as' || key === 'ws')
          val = encodeURIComponent(val)
        if (key === 'kt') val = encodeURIComponent(val)

        if (key === 'kt' && j > 0) result += '+' + val
        else result += key + '=' + val
      })
    })

  return result
}

}).call(this,require("buffer").Buffer)

},{"buffer":72,"flatten":35,"thirty-two":36,"xtend":66}],35:[function(require,module,exports){
arguments[4][18][0].apply(exports,arguments)
},{"dup":18}],36:[function(require,module,exports){
/*                                                                              
Copyright (c) 2011, Chris Umbel

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in      
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN 
THE SOFTWARE.
*/

var base32 = require('./thirty-two');

exports.encode = base32.encode;
exports.decode = base32.decode;

},{"./thirty-two":37}],37:[function(require,module,exports){
(function (Buffer){
/*                                                                              
Copyright (c) 2011, Chris Umbel

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.                                                                   
*/

var charTable = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
var byteTable = [
    0xff, 0xff, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06,
    0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e,
    0x0f, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16,
    0x17, 0x18, 0x19, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06,
    0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e,
    0x0f, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16,
    0x17, 0x18, 0x19, 0xff, 0xff, 0xff, 0xff, 0xff
];

function quintetCount(buff) {
    var quintets = Math.floor(buff.length / 5);
    return buff.length % 5 == 0 ? quintets: quintets + 1;
}

exports.encode = function(plain) {
    var i = 0;
    var j = 0;
    var shiftIndex = 0;
    var digit = 0;
    var encoded = new Buffer(quintetCount(plain) * 8);
    if(!Buffer.isBuffer(plain)){
    	plain = new Buffer(plain);
    }

    /* byte by byte isn't as pretty as quintet by quintet but tests a bit
        faster. will have to revisit. */
    while(i < plain.length) {
        var current = plain[i];
    
        if(shiftIndex > 3) {
            digit = current & (0xff >> shiftIndex);
            shiftIndex = (shiftIndex + 5) % 8;
            digit = (digit << shiftIndex) | ((i + 1 < plain.length) ?
                plain[i + 1] : 0) >> (8 - shiftIndex);
            i++;
        } else {
            digit = (current >> (8 - (shiftIndex + 5))) & 0x1f;
            shiftIndex = (shiftIndex + 5) % 8;            
            if(shiftIndex == 0) i++;
        }
        
        encoded[j] = charTable.charCodeAt(digit);
        j++;
    }

    for(i = j; i < encoded.length; i++)
        encoded[i] = 0x3d; //'='.charCodeAt(0)
        
    return encoded;
};

exports.decode = function(encoded) {
    var shiftIndex = 0;
    var plainDigit = 0;
    var plainChar;
    var plainPos = 0;
    if(!Buffer.isBuffer(encoded)){
    	encoded = new Buffer(encoded);
    }
    var decoded = new Buffer(Math.ceil(encoded.length * 5 / 8));
    
    /* byte by byte isn't as pretty as octet by octet but tests a bit
        faster. will have to revisit. */    
    for(var i = 0; i < encoded.length; i++) {
    	if(encoded[i] == 0x3d){ //'='
    		break;
    	}
    		
        var encodedByte = encoded[i] - 0x30;
        
        if(encodedByte < byteTable.length) {
            plainDigit = byteTable[encodedByte];
            
            if(shiftIndex <= 3) {
                shiftIndex = (shiftIndex + 5) % 8;
                
                if(shiftIndex == 0) {
                    plainChar |= plainDigit;
                    decoded[plainPos] = plainChar;
                    plainPos++;
                    plainChar = 0;
                } else {
                    plainChar |= 0xff & (plainDigit << (8 - shiftIndex));
                }
            } else {
                shiftIndex = (shiftIndex + 5) % 8;
                plainChar |= 0xff & (plainDigit >>> shiftIndex);
                decoded[plainPos] = plainChar;
                plainPos++;

                plainChar = 0xff & (plainDigit << (8 - shiftIndex));
            }
        } else {
        	throw new Error('Invalid input - it is not base32 encoded string');
        }
    }
    return decoded.slice(0, plainPos);
};

}).call(this,require("buffer").Buffer)

},{"buffer":72}],38:[function(require,module,exports){
(function (Buffer){
module.exports = decodeTorrentFile
module.exports.decode = decodeTorrentFile
module.exports.encode = encodeTorrentFile

var bencode = require('bencode')
var path = require('path')
var sha1 = require('simple-sha1')

/**
 * Parse a torrent. Throws an exception if the torrent is missing required fields.
 * @param  {Buffer|Object} torrent
 * @return {Object}        parsed torrent
 */
function decodeTorrentFile (torrent) {
  if (Buffer.isBuffer(torrent)) {
    torrent = bencode.decode(torrent)
  }

  // sanity check
  ensure(torrent.info, 'info')
  ensure(torrent.info.name, 'info.name')
  ensure(torrent.info['piece length'], 'info[\'piece length\']')
  ensure(torrent.info.pieces, 'info.pieces')

  if (torrent.info.files) {
    torrent.info.files.forEach(function (file) {
      ensure(typeof file.length === 'number', 'info.files[0].length')
      ensure(file.path, 'info.files[0].path')
    })
  } else {
    ensure(torrent.info.length, 'info.length')
  }

  var result = {}
  result.info = torrent.info
  result.infoBuffer = bencode.encode(torrent.info)
  result.infoHash = sha1.sync(result.infoBuffer)

  result.name = torrent.info.name.toString()
  result.private = !!torrent.info.private

  if (torrent['creation date'])
    result.created = new Date(torrent['creation date'] * 1000)

  if (Buffer.isBuffer(torrent.comment))
    result.comment = torrent.comment.toString()

  // announce/announce-list may be missing if metadata fetched via ut_metadata extension
  var announce = torrent['announce-list']
  if (!announce) {
    if (torrent.announce) {
      announce = [[torrent.announce]]
    } else {
      announce = []
    }
  }

  result.announceList = announce.map(function (urls) {
    return urls.map(function (url) {
      return url.toString()
    })
  })

  result.announce = [].concat.apply([], result.announceList)

  // handle url-list (BEP19 / web seeding)
  if (Buffer.isBuffer(torrent['url-list'])) {
    // some clients set url-list to empty string
    torrent['url-list'] = torrent['url-list'].length > 0
      ? [ torrent['url-list'] ]
      : []
  }
  result.urlList = (torrent['url-list'] || []).map(function (url) {
    return url.toString()
  })

  var files = torrent.info.files || [torrent.info]
  result.files = files.map(function (file, i) {
    var parts = [].concat(file.name || result.name, file.path || []).map(function (p) {
      return p.toString()
    })
    return {
      path: path.join.apply(null, [path.sep].concat(parts)).slice(1),
      name: parts[parts.length - 1],
      length: file.length,
      offset: files.slice(0, i).reduce(sumLength, 0)
    }
  })

  result.length = files.reduce(sumLength, 0)

  var lastFile = result.files[result.files.length - 1]

  result.pieceLength = torrent.info['piece length']
  result.lastPieceLength = ((lastFile.offset + lastFile.length) % result.pieceLength) || result.pieceLength
  result.pieces = splitPieces(torrent.info.pieces)

  return result
}

/**
 * Convert a parsed torrent object back into a .torrent file buffer.
 * @param  {Object} parsed parsed torrent
 * @return {Buffer}
 */
function encodeTorrentFile (parsed) {
  var torrent = {
    info: parsed.info
  }

  if (parsed.announce && parsed.announce[0]) {
    torrent.announce = parsed.announce[0]
  }

  if (parsed.announceList) {
    torrent['announce-list'] = parsed.announceList.map(function (urls) {
      return urls.map(function (url) {
        url = new Buffer(url, 'utf8')
        if (!torrent.announce) {
          torrent.announce = url
        }
        return url
      })
    })
  }

  if (parsed.created) {
    torrent['creation date'] = (parsed.created.getTime() / 1000) | 0
  }
  return bencode.encode(torrent)
}

function sumLength (sum, file) {
  return sum + file.length
}

function splitPieces (buf) {
  var pieces = []
  for (var i = 0; i < buf.length; i += 20) {
    pieces.push(buf.slice(i, i + 20).toString('hex'))
  }
  return pieces
}

function ensure (bool, fieldName) {
  if (!bool) throw new Error('Torrent is missing required field: ' + fieldName)
}

}).call(this,require("buffer").Buffer)

},{"bencode":39,"buffer":72,"path":79,"simple-sha1":45}],39:[function(require,module,exports){
arguments[4][11][0].apply(exports,arguments)
},{"./lib/decode":40,"./lib/encode":42,"dup":11}],40:[function(require,module,exports){
(function (Buffer){
var Dict = require("./dict")

/**
 * Decodes bencoded data.
 *
 * @param  {Buffer} data
 * @param  {String} encoding
 * @return {Object|Array|Buffer|String|Number}
 */
function decode( data, encoding ) {

  decode.position = 0
  decode.encoding = encoding || null

  decode.data = !( Buffer.isBuffer(data) )
    ? new Buffer( data )
    : data

  return decode.next()

}

decode.position = 0
decode.data     = null
decode.encoding = null

decode.next = function() {

  switch( decode.data[decode.position] ) {
    case 0x64: return decode.dictionary(); break
    case 0x6C: return decode.list(); break
    case 0x69: return decode.integer(); break
    default:   return decode.bytes(); break
  }

}

decode.find = function( chr ) {

  var i = decode.position
  var c = decode.data.length
  var d = decode.data

  while( i < c ) {
    if( d[i] === chr )
      return i
    i++
  }

  throw new Error(
    'Invalid data: Missing delimiter "' +
    String.fromCharCode( chr ) + '" [0x' +
    chr.toString( 16 ) + ']'
  )

}

decode.dictionary = function() {

  decode.position++

  var dict = new Dict()

  while( decode.data[decode.position] !== 0x65 ) {
    dict.binarySet(decode.bytes(), decode.next())
  }

  decode.position++

  return dict

}

decode.list = function() {

  decode.position++

  var lst = []

  while( decode.data[decode.position] !== 0x65 ) {
    lst.push( decode.next() )
  }

  decode.position++

  return lst

}

decode.integer = function() {

  var end    = decode.find( 0x65 )
  var number = decode.data.toString( 'ascii', decode.position + 1, end )

  decode.position += end + 1 - decode.position

  return parseInt( number, 10 )

}

decode.bytes = function() {

  var sep    = decode.find( 0x3A )
  var length = parseInt( decode.data.toString( 'ascii', decode.position, sep ), 10 )
  var end    = ++sep + length

  decode.position = end

  return decode.encoding
    ? decode.data.toString( decode.encoding, sep, end )
    : decode.data.slice( sep, end )

}

// Exports
module.exports = decode

}).call(this,require("buffer").Buffer)

},{"./dict":41,"buffer":72}],41:[function(require,module,exports){
arguments[4][13][0].apply(exports,arguments)
},{"dup":13}],42:[function(require,module,exports){
(function (Buffer){
/**
 * Encodes data in bencode.
 *
 * @param  {Buffer|Array|String|Object|Number} data
 * @return {Buffer}
 */
function encode( data ) {
  var buffers = []
  encode._encode( buffers, data )
  return Buffer.concat( buffers )
}

encode._floatConversionDetected = false

encode._encode = function( buffers, data ) {

  if( Buffer.isBuffer(data) ) {
    buffers.push(new Buffer(data.length + ':'))
    buffers.push(data)
    return;
  }

  switch( typeof data ) {
    case 'string':
      encode.bytes( buffers, data )
      break
    case 'number':
      encode.number( buffers, data )
      break
    case 'object':
      data.constructor === Array
        ? encode.list( buffers, data )
        : encode.dict( buffers, data )
      break
  }

}

var buff_e = new Buffer('e')
  , buff_d = new Buffer('d')
  , buff_l = new Buffer('l')

encode.bytes = function( buffers, data ) {

  buffers.push( new Buffer(Buffer.byteLength( data ) + ':' + data) )
}

encode.number = function( buffers, data ) {
  var maxLo = 0x80000000
  var hi = ( data / maxLo ) << 0
  var lo = ( data % maxLo  ) << 0
  var val = hi * maxLo + lo

  buffers.push( new Buffer( 'i' + val + 'e' ))

  if( val !== data && !encode._floatConversionDetected ) {
    encode._floatConversionDetected = true
    console.warn(
      'WARNING: Possible data corruption detected with value "'+data+'":',
      'Bencoding only defines support for integers, value was converted to "'+val+'"'
    )
    console.trace()
  }

}

encode.dict = function( buffers, data ) {

  buffers.push( buff_d )

  var j = 0
  var k
  // fix for issue #13 - sorted dicts
  var keys = Object.keys( data ).sort()
  var kl = keys.length

  for( ; j < kl ; j++) {
    k=keys[j]
    encode.bytes( buffers, k )
    encode._encode( buffers, data[k] )
  }

  buffers.push( buff_e )
}

encode.list = function( buffers, data ) {

  var i = 0, j = 1
  var c = data.length
  buffers.push( buff_l )

  for( ; i < c; i++ ) {
    encode._encode( buffers, data[i] )
  }

  buffers.push( buff_e )

}

// Expose
module.exports = encode

}).call(this,require("buffer").Buffer)

},{"buffer":72}],43:[function(require,module,exports){
module.exports = reemit
module.exports.filter = filter

var EventEmitter = require('events').EventEmitter

function reemit (source, target, events) {
  if (!Array.isArray(events)) events = [ events ]

  events.forEach(function (event) {
    source.on(event, function () {
      var args = [].slice.call(arguments)
      args.unshift(event)
      target.emit.apply(target, args)
    })
  })
}

function filter (source, events) {
  var emitter = new EventEmitter()
  reemit(source, emitter, events)
  return emitter
}

},{"events":76}],44:[function(require,module,exports){
module.exports = function (tasks, cb) {
  var results, pending, keys
  if (Array.isArray(tasks)) {
    results = []
    pending = tasks.length
  } else {
    keys = Object.keys(tasks)
    results = {}
    pending = keys.length
  }

  function done (i, err, result) {
    results[i] = result
    if (--pending === 0 || err) {
      cb && cb(err, results)
      cb = null
    }
  }

  if (!pending) {
    // empty
    cb && cb(null, results)
    cb = null
  } else if (keys) {
    // object
    keys.forEach(function (key) {
      tasks[key](done.bind(undefined, key))
    })
  } else {
    // array
    tasks.forEach(function (task, i) {
      task(done.bind(undefined, i))
    })
  }
}

},{}],45:[function(require,module,exports){
var Rusha = require('rusha')

var rusha = new Rusha
var crypto = window.crypto || window.msCrypto || {}
var subtle = crypto.subtle || crypto.webkitSubtle
var sha1sync = rusha.digest.bind(rusha)

// Browsers throw if they lack support for an algorithm.
// Promise will be rejected on non-secure origins. (http://goo.gl/lq4gCo)
try {
  subtle.digest({ name: 'sha-1' }, new Uint8Array).catch(function () {
    subtle = false
  })
} catch (err) { subtle = false }

function sha1 (buf, cb) {
  if (!subtle) {
    // Use Rusha
    setTimeout(cb, 0, sha1sync(buf))
    return
  }

  if (typeof buf === 'string') {
    buf = uint8array(buf)
  }

  subtle.digest({ name: 'sha-1' }, buf)
    .then(function succeed (result) {
      cb(hex(new Uint8Array(result)))
    },
    function fail (error) {
      cb(sha1sync(buf))
    })
}

function uint8array (s) {
  var l = s.length
  var array = new Uint8Array(l)
  for (var i = 0; i < l; i++) {
    array[i] = s.charCodeAt(i)
  }
  return array
}

function hex (buf) {
  var l = buf.length
  var chars = []
  for (var i = 0; i < l; i++) {
    var bite = buf[i]
    chars.push((bite >>> 4).toString(16))
    chars.push((bite & 0x0f).toString(16))
  }
  return chars.join('')
}

module.exports = sha1
module.exports.sync = sha1sync

},{"rusha":46}],46:[function(require,module,exports){
(function (global){
/*
 * Rusha, a JavaScript implementation of the Secure Hash Algorithm, SHA-1,
 * as defined in FIPS PUB 180-1, tuned for high performance with large inputs.
 * (http://github.com/srijs/rusha)
 *
 * Inspired by Paul Johnstons implementation (http://pajhome.org.uk/crypt/md5).
 *
 * Copyright (c) 2013 Sam Rijs (http://awesam.de).
 * Released under the terms of the MIT license as follows:
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
 * IN THE SOFTWARE.
 */
(function () {
    // If we'e running in Node.JS, export a module.
    if (typeof module !== 'undefined') {
        module.exports = Rusha;
    } else if (typeof window !== 'undefined') {
        window.Rusha = Rusha;
    }
    // If we're running in a webworker, accept
    // messages containing a jobid and a buffer
    // or blob object, and return the hash result.
    if (typeof FileReaderSync !== 'undefined') {
        var reader = new FileReaderSync(), hasher = new Rusha(4 * 1024 * 1024);
        self.onmessage = function onMessage(event) {
            var hash, data = event.data.data;
            try {
                hash = hasher.digest(data);
                self.postMessage({
                    id: event.data.id,
                    hash: hash
                });
            } catch (e) {
                self.postMessage({
                    id: event.data.id,
                    error: e.name
                });
            }
        };
    }
    var util = {
            getDataType: function (data) {
                if (typeof data === 'string') {
                    return 'string';
                }
                if (data instanceof Array) {
                    return 'array';
                }
                if (typeof global !== 'undefined' && global.Buffer && global.Buffer.isBuffer(data)) {
                    return 'buffer';
                }
                if (data instanceof ArrayBuffer) {
                    return 'arraybuffer';
                }
                if (data.buffer instanceof ArrayBuffer) {
                    return 'view';
                }
                if (data instanceof Blob) {
                    return 'blob';
                }
                throw new Error('Unsupported data type.');
            }
        };
    // The Rusha object is a wrapper around the low-level RushaCore.
    // It provides means of converting different inputs to the
    // format accepted by RushaCore as well as other utility methods.
    function Rusha(chunkSize) {
        'use strict';
        // Private object structure.
        var self$2 = { fill: 0 };
        // Calculate the length of buffer that the sha1 routine uses
        // including the padding.
        var padlen = function (len) {
            for (len += 9; len % 64 > 0; len += 1);
            return len;
        };
        var padZeroes = function (bin, len) {
            for (var i = len >> 2; i < bin.length; i++)
                bin[i] = 0;
        };
        var padData = function (bin, chunkLen, msgLen) {
            bin[chunkLen >> 2] |= 128 << 24 - (chunkLen % 4 << 3);
            bin[((chunkLen >> 2) + 2 & ~15) + 14] = msgLen >> 29;
            bin[((chunkLen >> 2) + 2 & ~15) + 15] = msgLen << 3;
        };
        // Convert a binary string and write it to the heap.
        // A binary string is expected to only contain char codes < 256.
        var convStr = function (H8, H32, start, len, off) {
            var str = this, i, om = off % 4, lm = len % 4, j = len - lm;
            if (j > 0) {
                switch (om) {
                case 0:
                    H8[off + 3 | 0] = str.charCodeAt(start);
                case 1:
                    H8[off + 2 | 0] = str.charCodeAt(start + 1);
                case 2:
                    H8[off + 1 | 0] = str.charCodeAt(start + 2);
                case 3:
                    H8[off | 0] = str.charCodeAt(start + 3);
                }
            }
            for (i = om; i < j; i = i + 4 | 0) {
                H32[off + i >> 2] = str.charCodeAt(start + i) << 24 | str.charCodeAt(start + i + 1) << 16 | str.charCodeAt(start + i + 2) << 8 | str.charCodeAt(start + i + 3);
            }
            switch (lm) {
            case 3:
                H8[off + j + 1 | 0] = str.charCodeAt(start + j + 2);
            case 2:
                H8[off + j + 2 | 0] = str.charCodeAt(start + j + 1);
            case 1:
                H8[off + j + 3 | 0] = str.charCodeAt(start + j);
            }
        };
        // Convert a buffer or array and write it to the heap.
        // The buffer or array is expected to only contain elements < 256.
        var convBuf = function (H8, H32, start, len, off) {
            var buf = this, i, om = off % 4, lm = len % 4, j = len - lm;
            if (j > 0) {
                switch (om) {
                case 0:
                    H8[off + 3 | 0] = buf[start];
                case 1:
                    H8[off + 2 | 0] = buf[start + 1];
                case 2:
                    H8[off + 1 | 0] = buf[start + 2];
                case 3:
                    H8[off | 0] = buf[start + 3];
                }
            }
            for (i = 4 - om; i < j; i = i += 4 | 0) {
                H32[off + i >> 2] = buf[start + i] << 24 | buf[start + i + 1] << 16 | buf[start + i + 2] << 8 | buf[start + i + 3];
            }
            switch (lm) {
            case 3:
                H8[off + j + 1 | 0] = buf[start + j + 2];
            case 2:
                H8[off + j + 2 | 0] = buf[start + j + 1];
            case 1:
                H8[off + j + 3 | 0] = buf[start + j];
            }
        };
        var convBlob = function (H8, H32, start, len, off) {
            var blob = this, i, om = off % 4, lm = len % 4, j = len - lm;
            var buf = new Uint8Array(reader.readAsArrayBuffer(blob.slice(start, start + len)));
            if (j > 0) {
                switch (om) {
                case 0:
                    H8[off + 3 | 0] = buf[0];
                case 1:
                    H8[off + 2 | 0] = buf[1];
                case 2:
                    H8[off + 1 | 0] = buf[2];
                case 3:
                    H8[off | 0] = buf[3];
                }
            }
            for (i = 4 - om; i < j; i = i += 4 | 0) {
                H32[off + i >> 2] = buf[i] << 24 | buf[i + 1] << 16 | buf[i + 2] << 8 | buf[i + 3];
            }
            switch (lm) {
            case 3:
                H8[off + j + 1 | 0] = buf[j + 2];
            case 2:
                H8[off + j + 2 | 0] = buf[j + 1];
            case 1:
                H8[off + j + 3 | 0] = buf[j];
            }
        };
        var convFn = function (data) {
            switch (util.getDataType(data)) {
            case 'string':
                return convStr.bind(data);
            case 'array':
                return convBuf.bind(data);
            case 'buffer':
                return convBuf.bind(data);
            case 'arraybuffer':
                return convBuf.bind(new Uint8Array(data));
            case 'view':
                return convBuf.bind(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
            case 'blob':
                return convBlob.bind(data);
            }
        };
        var slice = function (data, offset) {
            switch (util.getDataType(data)) {
            case 'string':
                return data.slice(offset);
            case 'array':
                return data.slice(offset);
            case 'buffer':
                return data.slice(offset);
            case 'arraybuffer':
                return data.slice(offset);
            case 'view':
                return data.buffer.slice(offset);
            }
        };
        // Convert an ArrayBuffer into its hexadecimal string representation.
        var hex = function (arrayBuffer) {
            var i, x, hex_tab = '0123456789abcdef', res = [], binarray = new Uint8Array(arrayBuffer);
            for (i = 0; i < binarray.length; i++) {
                x = binarray[i];
                res[i] = hex_tab.charAt(x >> 4 & 15) + hex_tab.charAt(x >> 0 & 15);
            }
            return res.join('');
        };
        var ceilHeapSize = function (v) {
            // The asm.js spec says:
            // The heap object's byteLength must be either
            // 2^n for n in [12, 24) or 2^24 * n for n ≥ 1.
            // Also, byteLengths smaller than 2^16 are deprecated.
            var p;
            // If v is smaller than 2^16, the smallest possible solution
            // is 2^16.
            if (v <= 65536)
                return 65536;
            // If v < 2^24, we round up to 2^n,
            // otherwise we round up to 2^24 * n.
            if (v < 16777216) {
                for (p = 1; p < v; p = p << 1);
            } else {
                for (p = 16777216; p < v; p += 16777216);
            }
            return p;
        };
        // Initialize the internal data structures to a new capacity.
        var init = function (size) {
            if (size % 64 > 0) {
                throw new Error('Chunk size must be a multiple of 128 bit');
            }
            self$2.maxChunkLen = size;
            self$2.padMaxChunkLen = padlen(size);
            // The size of the heap is the sum of:
            // 1. The padded input message size
            // 2. The extended space the algorithm needs (320 byte)
            // 3. The 160 bit state the algoritm uses
            self$2.heap = new ArrayBuffer(ceilHeapSize(self$2.padMaxChunkLen + 320 + 20));
            self$2.h32 = new Int32Array(self$2.heap);
            self$2.h8 = new Int8Array(self$2.heap);
            self$2.core = RushaCore({
                Int32Array: Int32Array,
                DataView: DataView
            }, {}, self$2.heap);
            self$2.buffer = null;
        };
        // Iinitializethe datastructures according
        // to a chunk siyze.
        init(chunkSize || 64 * 1024);
        var initState = function (heap, padMsgLen) {
            var io = new Int32Array(heap, padMsgLen + 320, 5);
            io[0] = 1732584193;
            io[1] = -271733879;
            io[2] = -1732584194;
            io[3] = 271733878;
            io[4] = -1009589776;
        };
        var padChunk = function (chunkLen, msgLen) {
            var padChunkLen = padlen(chunkLen);
            var view = new Int32Array(self$2.heap, 0, padChunkLen >> 2);
            padZeroes(view, chunkLen);
            padData(view, chunkLen, msgLen);
            return padChunkLen;
        };
        // Write data to the heap.
        var write = function (data, chunkOffset, chunkLen) {
            convFn(data)(self$2.h8, self$2.h32, chunkOffset, chunkLen, 0);
        };
        // Initialize and call the RushaCore,
        // assuming an input buffer of length len * 4.
        var coreCall = function (data, chunkOffset, chunkLen, msgLen, finalize) {
            var padChunkLen = chunkLen;
            if (finalize) {
                padChunkLen = padChunk(chunkLen, msgLen);
            }
            write(data, chunkOffset, chunkLen);
            self$2.core.hash(padChunkLen, self$2.padMaxChunkLen);
        };
        var getRawDigest = function (heap, padMaxChunkLen) {
            var io = new Int32Array(heap, padMaxChunkLen + 320, 5);
            var out = new Int32Array(5);
            var arr = new DataView(out.buffer);
            arr.setInt32(0, io[0], false);
            arr.setInt32(4, io[1], false);
            arr.setInt32(8, io[2], false);
            arr.setInt32(12, io[3], false);
            arr.setInt32(16, io[4], false);
            return out;
        };
        // Calculate the hash digest as an array of 5 32bit integers.
        var rawDigest = this.rawDigest = function (str) {
                var msgLen = str.byteLength || str.length || str.size || 0;
                initState(self$2.heap, self$2.padMaxChunkLen);
                var chunkOffset = 0, chunkLen = self$2.maxChunkLen, last;
                for (chunkOffset = 0; msgLen > chunkOffset + chunkLen; chunkOffset += chunkLen) {
                    coreCall(str, chunkOffset, chunkLen, msgLen, false);
                }
                coreCall(str, chunkOffset, msgLen - chunkOffset, msgLen, true);
                return getRawDigest(self$2.heap, self$2.padMaxChunkLen);
            };
        // The digest and digestFrom* interface returns the hash digest
        // as a hex string.
        this.digest = this.digestFromString = this.digestFromBuffer = this.digestFromArrayBuffer = function (str) {
            return hex(rawDigest(str).buffer);
        };
    }
    ;
    // The low-level RushCore module provides the heart of Rusha,
    // a high-speed sha1 implementation working on an Int32Array heap.
    // At first glance, the implementation seems complicated, however
    // with the SHA1 spec at hand, it is obvious this almost a textbook
    // implementation that has a few functions hand-inlined and a few loops
    // hand-unrolled.
    function RushaCore(stdlib, foreign, heap) {
        'use asm';
        var H = new stdlib.Int32Array(heap);
        function hash(k, x) {
            // k in bytes
            k = k | 0;
            x = x | 0;
            var i = 0, j = 0, y0 = 0, z0 = 0, y1 = 0, z1 = 0, y2 = 0, z2 = 0, y3 = 0, z3 = 0, y4 = 0, z4 = 0, t0 = 0, t1 = 0;
            y0 = H[x + 320 >> 2] | 0;
            y1 = H[x + 324 >> 2] | 0;
            y2 = H[x + 328 >> 2] | 0;
            y3 = H[x + 332 >> 2] | 0;
            y4 = H[x + 336 >> 2] | 0;
            for (i = 0; (i | 0) < (k | 0); i = i + 64 | 0) {
                z0 = y0;
                z1 = y1;
                z2 = y2;
                z3 = y3;
                z4 = y4;
                for (j = 0; (j | 0) < 64; j = j + 4 | 0) {
                    t1 = H[i + j >> 2] | 0;
                    t0 = ((y0 << 5 | y0 >>> 27) + (y1 & y2 | ~y1 & y3) | 0) + ((t1 + y4 | 0) + 1518500249 | 0) | 0;
                    y4 = y3;
                    y3 = y2;
                    y2 = y1 << 30 | y1 >>> 2;
                    y1 = y0;
                    y0 = t0;
                    ;
                    H[k + j >> 2] = t1;
                }
                for (j = k + 64 | 0; (j | 0) < (k + 80 | 0); j = j + 4 | 0) {
                    t1 = (H[j - 12 >> 2] ^ H[j - 32 >> 2] ^ H[j - 56 >> 2] ^ H[j - 64 >> 2]) << 1 | (H[j - 12 >> 2] ^ H[j - 32 >> 2] ^ H[j - 56 >> 2] ^ H[j - 64 >> 2]) >>> 31;
                    t0 = ((y0 << 5 | y0 >>> 27) + (y1 & y2 | ~y1 & y3) | 0) + ((t1 + y4 | 0) + 1518500249 | 0) | 0;
                    y4 = y3;
                    y3 = y2;
                    y2 = y1 << 30 | y1 >>> 2;
                    y1 = y0;
                    y0 = t0;
                    ;
                    H[j >> 2] = t1;
                }
                for (j = k + 80 | 0; (j | 0) < (k + 160 | 0); j = j + 4 | 0) {
                    t1 = (H[j - 12 >> 2] ^ H[j - 32 >> 2] ^ H[j - 56 >> 2] ^ H[j - 64 >> 2]) << 1 | (H[j - 12 >> 2] ^ H[j - 32 >> 2] ^ H[j - 56 >> 2] ^ H[j - 64 >> 2]) >>> 31;
                    t0 = ((y0 << 5 | y0 >>> 27) + (y1 ^ y2 ^ y3) | 0) + ((t1 + y4 | 0) + 1859775393 | 0) | 0;
                    y4 = y3;
                    y3 = y2;
                    y2 = y1 << 30 | y1 >>> 2;
                    y1 = y0;
                    y0 = t0;
                    ;
                    H[j >> 2] = t1;
                }
                for (j = k + 160 | 0; (j | 0) < (k + 240 | 0); j = j + 4 | 0) {
                    t1 = (H[j - 12 >> 2] ^ H[j - 32 >> 2] ^ H[j - 56 >> 2] ^ H[j - 64 >> 2]) << 1 | (H[j - 12 >> 2] ^ H[j - 32 >> 2] ^ H[j - 56 >> 2] ^ H[j - 64 >> 2]) >>> 31;
                    t0 = ((y0 << 5 | y0 >>> 27) + (y1 & y2 | y1 & y3 | y2 & y3) | 0) + ((t1 + y4 | 0) - 1894007588 | 0) | 0;
                    y4 = y3;
                    y3 = y2;
                    y2 = y1 << 30 | y1 >>> 2;
                    y1 = y0;
                    y0 = t0;
                    ;
                    H[j >> 2] = t1;
                }
                for (j = k + 240 | 0; (j | 0) < (k + 320 | 0); j = j + 4 | 0) {
                    t1 = (H[j - 12 >> 2] ^ H[j - 32 >> 2] ^ H[j - 56 >> 2] ^ H[j - 64 >> 2]) << 1 | (H[j - 12 >> 2] ^ H[j - 32 >> 2] ^ H[j - 56 >> 2] ^ H[j - 64 >> 2]) >>> 31;
                    t0 = ((y0 << 5 | y0 >>> 27) + (y1 ^ y2 ^ y3) | 0) + ((t1 + y4 | 0) - 899497514 | 0) | 0;
                    y4 = y3;
                    y3 = y2;
                    y2 = y1 << 30 | y1 >>> 2;
                    y1 = y0;
                    y0 = t0;
                    ;
                    H[j >> 2] = t1;
                }
                y0 = y0 + z0 | 0;
                y1 = y1 + z1 | 0;
                y2 = y2 + z2 | 0;
                y3 = y3 + z3 | 0;
                y4 = y4 + z4 | 0;
            }
            H[x + 320 >> 2] = y0;
            H[x + 324 >> 2] = y1;
            H[x + 328 >> 2] = y2;
            H[x + 332 >> 2] = y3;
            H[x + 336 >> 2] = y4;
        }
        return { hash: hash };
    }
}());
}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}],47:[function(require,module,exports){
var tick = 1
var maxTick = 65535
var resolution = 4
var inc = function() {
  tick = (tick + 1) & maxTick
}

var timer = setInterval(inc, (1000 / resolution) | 0)
if (timer.unref) timer.unref()

module.exports = function(seconds) {
  var size = resolution * (seconds || 5)
  var buffer = [0]
  var pointer = 1
  var last = (tick-1) & maxTick

  return function(delta) {
    var dist = (tick - last) & maxTick
    if (dist > size) dist = size
    last = tick

    while (dist--) {
      if (pointer === size) pointer = 0
      buffer[pointer] = buffer[pointer === 0 ? size-1 : pointer-1]
      pointer++
    }

    if (delta) buffer[pointer-1] += delta

    var top = buffer[pointer-1]
    var btm = buffer.length < size ? 0 : buffer[pointer === size ? 0 : pointer]

    return buffer.length < resolution ? top : (top - btm) * resolution / buffer.length
  }
}
},{}],48:[function(require,module,exports){
(function (process){
module.exports = Discovery

var debug = require('debug')('torrent-discovery')
var DHT = require('bittorrent-dht/client') // empty object in browser
var EventEmitter = require('events').EventEmitter
var extend = require('xtend/mutable')
var inherits = require('inherits')
var reemit = require('re-emitter')
var Tracker = require('bittorrent-tracker/client') // `webtorrent-tracker` in browser

inherits(Discovery, EventEmitter)

function Discovery (opts) {
  var self = this
  if (!(self instanceof Discovery)) return new Discovery(opts)
  EventEmitter.call(self)

  extend(self, {
    announce: [],
    dht: typeof DHT === 'function',
    rtcConfig: null, // browser only
    peerId: null,
    port: 0, // torrent port
    tracker: true
  }, opts)

  self._externalDHT = typeof self.dht === 'object'
  self._performedDHTLookup = false

  if (!self.peerId) throw new Error('peerId required')
  if (!process.browser && !self.port) throw new Error('port required')
  if (process.browser && (!self.announce || self.announce.length === 0))
    console.warn('Warning: must specify a tracker server to discover peers (required in browser because DHT is not implemented yet) (you can use wss://tracker.webtorrent.io)')

  if (self.dht) self._createDHT(self.dhtPort)
}

Discovery.prototype.setTorrent = function (torrent) {
  var self = this
  if (self.torrent) return

  if (torrent && torrent.infoHash) {
    self.torrent = torrent
    self.infoHash = torrent.infoHash
  } else {
    if (self.infoHash) return
    self.infoHash = torrent
  }
  debug('setTorrent %s', torrent)

  // If tracker exists, then it was created with just infoHash. Set torrent length
  // so client can report correct information about uploads.
  if (self.tracker && self.tracker !== true)
    self.tracker.torrentLength = torrent.length
  else
    self._createTracker()

  if (self.dht) {
    if (self.dht.ready) self._dhtLookupAndAnnounce()
    else self.dht.on('ready', self._dhtLookupAndAnnounce.bind(self))
  }
}

Discovery.prototype.stop = function (cb) {
  var self = this
  if (self.tracker && self.tracker.stop) self.tracker.stop()
  if (!self._externalDHT && self.dht && self.dht.destroy) self.dht.destroy(cb)
  else process.nextTick(function () { cb(null) })
}

Discovery.prototype._createDHT = function (port) {
  var self = this
  if (!self._externalDHT) self.dht = new DHT()
  reemit(self.dht, self, ['error', 'warning'])
  self.dht.on('peer', function (addr, infoHash) {
    if (infoHash === self.infoHash) self.emit('peer', addr)
  })
  if (!self._externalDHT) self.dht.listen(port)
}

Discovery.prototype._createTracker = function () {
  var self = this
  if (!self.tracker) return

  var torrent = self.torrent || {
    infoHash: self.infoHash,
    announce: self.announce
  }

  self.tracker = process.browser
    ? new Tracker(self.peerId, torrent, { rtcConfig: self.rtcConfig })
    : new Tracker(self.peerId, self.port, torrent)

  reemit(self.tracker, self, ['peer', 'warning', 'error'])
  self.tracker.start()
}

Discovery.prototype._dhtLookupAndAnnounce = function () {
  var self = this
  if (self._performedDHTLookup) return
  self._performedDHTLookup = true

  debug('dht lookup')
  self.dht.lookup(self.infoHash, function (err) {
    if (err || !self.port) return
    debug('dht announce')
    self.dht.announce(self.infoHash, self.port, function () {
      debug('dht announce complete')
      self.emit('dhtAnnounce')
    })
  })
}

}).call(this,require('_process'))

},{"_process":80,"bittorrent-dht/client":71,"bittorrent-tracker/client":49,"debug":21,"events":76,"inherits":29,"re-emitter":43,"xtend/mutable":67}],49:[function(require,module,exports){
(function (Buffer){
module.exports = Client

var debug = require('debug')('webtorrent-tracker')
var EventEmitter = require('events').EventEmitter
var extend = require('extend.js')
var hat = require('hat')
var inherits = require('inherits')
var Peer = require('simple-peer')
var Socket = require('simple-websocket')

var DEFAULT_NUM_WANT = 15

inherits(Client, EventEmitter)

// It turns out that you can't open multiple websockets to the same server within one
// browser tab, so let's reuse them.
var sockets = {}

/**
 * A Client manages tracker connections for a torrent.
 *
 * @param {string} peerId  this peer's id
 * @param {Object} torrent parsed torrent
 * @param {Object} opts    optional options
 * @param {Number} opts.numWant    number of peers to request
 * @param {Number} opts.interval   interval in ms to send announce requests to the tracker
 * @param {Number} opts.rtcConfig  RTCPeerConnection configuration object
 */
function Client (peerId, torrent, opts) {
  var self = this
  if (!(self instanceof Client)) return new Client(peerId, torrent, opts)
  EventEmitter.call(self)
  self._opts = opts || {}

  // required
  self._peerId = Buffer.isBuffer(peerId)
    ? peerId
    : new Buffer(peerId, 'hex')
  self._infoHash = Buffer.isBuffer(torrent.infoHash)
    ? torrent.infoHash
    : new Buffer(torrent.infoHash, 'hex')
  self.torrentLength = torrent.length

  // optional
  self._numWant = self._opts.numWant || DEFAULT_NUM_WANT
  self._intervalMs = self._opts.interval || (30 * 60 * 1000) // default: 30 minutes

  debug('new client %s', self._infoHash.toString('hex'))

  if (typeof torrent.announce === 'string') torrent.announce = [ torrent.announce ]
  self._trackers = (torrent.announce || [])
    .filter(function (announceUrl) {
      return announceUrl.indexOf('ws://') === 0 || announceUrl.indexOf('wss://') === 0
    })
    .map(function (announceUrl) {
      return new Tracker(self, announceUrl, self._opts)
    })
}

Client.prototype.start = function (opts) {
  var self = this
  self._trackers.forEach(function (tracker) {
    tracker.start(opts)
  })
}

Client.prototype.stop = function (opts) {
  var self = this
  self._trackers.forEach(function (tracker) {
    tracker.stop(opts)
  })
}

Client.prototype.complete = function (opts) {
  var self = this
  self._trackers.forEach(function (tracker) {
    tracker.complete(opts)
  })
}

Client.prototype.update = function (opts) {
  var self = this
  self._trackers.forEach(function (tracker) {
    tracker.update(opts)
  })
}

Client.prototype.setInterval = function (intervalMs) {
  var self = this
  self._intervalMs = intervalMs

  self._trackers.forEach(function (tracker) {
    tracker.setInterval(intervalMs)
  })
}

inherits(Tracker, EventEmitter)

/**
 * An individual torrent tracker (used by Client)
 *
 * @param {Client} client       parent bittorrent tracker client
 * @param {string} announceUrl  announce url of tracker
 * @param {Object} opts         optional options
 */
function Tracker (client, announceUrl, opts) {
  var self = this
  EventEmitter.call(self)
  self._opts = opts || {}
  self._announceUrl = announceUrl
  self._peers = {} // peers (offer id -> peer)

  debug('new tracker %s', announceUrl)

  self.client = client
  self.ready = false

  self._socket = null
  self._intervalMs = self.client._intervalMs // use client interval initially
  self._interval = null
}

Tracker.prototype.start = function (opts) {
  var self = this
  opts = opts || {}
  opts.event = 'started'

  debug('sent `start` %s %s', self._announceUrl, JSON.stringify(opts))
  self._announce(opts)
  self.setInterval(self._intervalMs) // start announcing on intervals
}

Tracker.prototype.stop = function (opts) {
  var self = this
  opts = opts || {}
  opts.event = 'stopped'

  debug('sent `stop` %s %s', self._announceUrl, JSON.stringify(opts))
  self._announce(opts)
  self.setInterval(0) // stop announcing on intervals

  // TODO: destroy the websocket
}

Tracker.prototype.complete = function (opts) {
  var self = this
  opts = opts || {}
  opts.event = 'completed'
  opts.downloaded = opts.downloaded || self.torrentLength || 0

  debug('sent `complete` %s %s', self._announceUrl, JSON.stringify(opts))
  self._announce(opts)
}

Tracker.prototype.update = function (opts) {
  var self = this
  opts = opts || {}

  debug('sent `update` %s %s', self._announceUrl, JSON.stringify(opts))
  self._announce(opts)
}

Tracker.prototype._init = function (onready) {
  var self = this
  if (onready) self.once('ready', onready)
  if (self._socket) return

  if (sockets[self._announceUrl]) {
    self._socket = sockets[self._announceUrl]
    self._onSocketReady()
  } else {
    self._socket = sockets[self._announceUrl] = new Socket(self._announceUrl)
    self._socket.on('ready', self._onSocketReady.bind(self))
  }
  self._socket.on('warning', self._onSocketWarning.bind(self))
  self._socket.on('error', self._onSocketWarning.bind(self))
  self._socket.on('message', self._onSocketMessage.bind(self))
}

Tracker.prototype._onSocketReady = function () {
  var self = this
  self.ready = true
  self.emit('ready')
}

Tracker.prototype._onSocketWarning = function (err) {
  debug('tracker warning %s', err.message)
}

Tracker.prototype._onSocketMessage = function (data) {
  var self = this

  if (!(typeof data === 'object' && data !== null))
    return self.client.emit('warning', new Error('Invalid tracker response'))

  if (data.info_hash !== self.client._infoHash.toString('binary'))
    return

  debug('received %s from %s', JSON.stringify(data), self._announceUrl)

  var failure = data['failure reason']
  if (failure)
    return self.client.emit('warning', new Error(failure))

  var warning = data['warning message']
  if (warning)
    self.client.emit('warning', new Error(warning))

  var interval = data.interval || data['min interval']
  if (interval && !self._opts.interval && self._intervalMs !== 0) {
    // use the interval the tracker recommends, UNLESS the user manually specifies an
    // interval they want to use
    self.setInterval(interval * 1000)
  }

  var trackerId = data['tracker id']
  if (trackerId) {
    // If absent, do not discard previous trackerId value
    self._trackerId = trackerId
  }

  if (data.complete) {
    self.client.emit('update', {
      announce: self._announceUrl,
      complete: data.complete,
      incomplete: data.incomplete
    })
  }

  var peer
  if (data.offer) {
    peer = new Peer({ trickle: false, config: self._opts.rtcConfig })
    peer.id = binaryToHex(data.peer_id)
    peer.once('signal', function (answer) {
      var opts = {
        info_hash: self.client._infoHash.toString('binary'),
        peer_id: self.client._peerId.toString('binary'),
        to_peer_id: data.peer_id,
        answer: answer,
        offer_id: data.offer_id
      }
      if (self._trackerId) opts.trackerid = self._trackerId
      self._send(opts)
    })
    peer.signal(data.offer)
    self.client.emit('peer', peer)
  }

  if (data.answer) {
    peer = self._peers[data.offer_id]
    if (peer) {
      peer.id = binaryToHex(data.peer_id)
      peer.signal(data.answer)
      self.client.emit('peer', peer)
    } else {
      debug('got unexpected answer: ' + JSON.stringify(data.answer))
    }
  }
}

/**
 * Send an announce request to the tracker.
 * @param {Object} opts
 * @param {number=} opts.uploaded
 * @param {number=} opts.downloaded
 * @param {number=} opts.left (if not set, calculated automatically)
 */
Tracker.prototype._announce = function (opts) {
  var self = this
  if (!self.ready) return self._init(self._announce.bind(self, opts))

  self._generateOffers(function (offers) {
    opts = extend({
      uploaded: 0, // default, user should provide real value
      downloaded: 0, // default, user should provide real value
      info_hash: self.client._infoHash.toString('binary'),
      peer_id: self.client._peerId.toString('binary'),
      offers: offers
    }, opts)

    if (self.client.torrentLength != null && opts.left == null) {
      opts.left = self.client.torrentLength - (opts.downloaded || 0)
    }

    if (self._trackerId) {
      opts.trackerid = self._trackerId
    }
    self._send(opts)
  })
}

Tracker.prototype._send = function (opts) {
  var self = this
  debug('send %s', JSON.stringify(opts))
  self._socket.send(opts)
}

Tracker.prototype._generateOffers = function (cb) {
  var self = this
  var offers = []
  debug('generating %s offers', self.client._numWant)

  // TODO: cleanup dead peers and peers that never get a return offer, from self._peers
  for (var i = 0; i < self.client._numWant; ++i) {
    generateOffer()
  }

  function generateOffer () {
    var offerId = hat(160)
    var peer = self._peers[offerId] = new Peer({
      initiator: true,
      trickle: false,
      config: self._opts.rtcConfig
    })
    peer.once('signal', function (offer) {
      offers.push({
        offer: offer,
        offer_id: offerId
      })
      checkDone()
    })
  }

  function checkDone () {
    if (offers.length === self.client._numWant) {
      debug('generated %s offers', self.client._numWant)
      cb(offers)
    }
  }
}

Tracker.prototype.setInterval = function (intervalMs) {
  var self = this
  clearInterval(self._interval)

  self._intervalMs = intervalMs
  if (intervalMs) {
    self._interval = setInterval(self.update.bind(self), self._intervalMs)
  }
}

function binaryToHex (id) {
  return new Buffer(id, 'binary').toString('hex')
}

}).call(this,require("buffer").Buffer)

},{"buffer":72,"debug":21,"events":76,"extend.js":50,"hat":28,"inherits":29,"simple-peer":51,"simple-websocket":54}],50:[function(require,module,exports){
/**
 * Extend an object with another.
 *
 * @param {Object, ...} src, ...
 * @return {Object} merged
 * @api private
 */

module.exports = function(src) {
  var objs = [].slice.call(arguments, 1), obj;

  for (var i = 0, len = objs.length; i < len; i++) {
    obj = objs[i];
    for (var prop in obj) {
      src[prop] = obj[prop];
    }
  }

  return src;
}

},{}],51:[function(require,module,exports){
module.exports = Peer

var debug = require('debug')('simple-peer')
var EventEmitter = require('events').EventEmitter
var extend = require('extend.js')
var hat = require('hat')
var inherits = require('inherits')
var isTypedArray = require('is-typedarray')
var once = require('once')
var stream = require('stream')
var toBuffer = require('typedarray-to-buffer')

var RTCPeerConnection = typeof window !== 'undefined' &&
    (window.mozRTCPeerConnection
  || window.RTCPeerConnection
  || window.webkitRTCPeerConnection)

var RTCSessionDescription = typeof window !== 'undefined' &&
    (window.mozRTCSessionDescription
  || window.RTCSessionDescription
  || window.webkitRTCSessionDescription)

var RTCIceCandidate = typeof window !== 'undefined' &&
    (window.mozRTCIceCandidate
  || window.RTCIceCandidate
  || window.webkitRTCIceCandidate)

inherits(Peer, EventEmitter)

/**
 * A WebRTC peer connection.
 * @param {Object} opts
 */
function Peer (opts) {
  var self = this
  if (!(self instanceof Peer)) return new Peer(opts)
  EventEmitter.call(self)

  opts = extend({
    initiator: false,
    stream: false,
    config: Peer.config,
    constraints: Peer.constraints,
    channelName: (opts && opts.initiator) ? hat(160) : null,
    trickle: true
  }, opts)

  extend(self, opts)

  debug('new peer initiator: %s channelName: %s', self.initiator, self.channelName)

  self.destroyed = false
  self.ready = false
  self._pcReady = false
  self._channelReady = false
  self._dataStreams = []
  self._iceComplete = false // done with ice candidate trickle (got null candidate)

  self._pc = new RTCPeerConnection(self.config, self.constraints)
  self._pc.oniceconnectionstatechange = self._onIceConnectionStateChange.bind(self)
  self._pc.onsignalingstatechange = self._onSignalingStateChange.bind(self)
  self._pc.onicecandidate = self._onIceCandidate.bind(self)

  self._channel = null

  if (self.stream)
    self._setupVideo(self.stream)
  self._pc.onaddstream = self._onAddStream.bind(self)

  if (self.initiator) {
    self._setupData({ channel: self._pc.createDataChannel(self.channelName) })

    self._pc.onnegotiationneeded = once(function () {
      self._pc.createOffer(function (offer) {
        speedHack(offer)
        self._pc.setLocalDescription(offer)
        var sendOffer = function () {
          self.emit('signal', self._pc.localDescription || offer)
        }
        if (self.trickle || self._iceComplete) sendOffer()
        else self.once('_iceComplete', sendOffer) // wait for candidates
      }, self._onError.bind(self))
    })

    if (window.mozRTCPeerConnection) {
      // Firefox does not trigger this event automatically
      setTimeout(function () {
        self._pc.onnegotiationneeded()
      }, 0)
    }
  } else {
    self._pc.ondatachannel = self._setupData.bind(self)
  }
}

/**
 * Expose config and constraints for overriding all Peer instances. Otherwise, just
 * set opts.config and opts.constraints when constructing a Peer.
 */
Peer.config = { iceServers: [ { url: 'stun:23.21.150.121' } ] }
Peer.constraints = {}

Peer.prototype.send = function (data, cb) {
  var self = this
  if (!self._channelReady) return self.once('ready', self.send.bind(self, data, cb))
  debug('send %s', data)

  if (isTypedArray.strict(data) || data instanceof ArrayBuffer ||
      data instanceof Blob || typeof data === 'string') {
    self._channel.send(data)
  } else {
    self._channel.send(JSON.stringify(data))
  }
  if (cb) cb(null)
}

Peer.prototype.signal = function (data) {
  var self = this
  if (self.destroyed) return
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data)
    } catch (err) {
      data = {}
    }
  }
  debug('signal %s', JSON.stringify(data))
  if (data.sdp) {
    self._pc.setRemoteDescription(new RTCSessionDescription(data), function () {
      var needsAnswer = self._pc.remoteDescription.type === 'offer'
      if (needsAnswer) {
        self._pc.createAnswer(function (answer) {
          speedHack(answer)
          self._pc.setLocalDescription(answer)
          var sendAnswer = function () {
            self.emit('signal', self._pc.localDescription || answer)
          }
          if (self.trickle || self._iceComplete) sendAnswer()
          else self.once('_iceComplete', sendAnswer)
        }, self._onError.bind(self))
      }
    }, self._onError.bind(self))
  }
  if (data.candidate) {
    try {
      self._pc.addIceCandidate(new RTCIceCandidate(data.candidate))
    } catch (err) {
      self.destroy(new Error('error adding candidate, ' + err.message))
    }
  }
  if (!data.sdp && !data.candidate)
    self.destroy(new Error('signal() called with invalid signal data'))
}

Peer.prototype.destroy = function (err, onclose) {
  var self = this
  if (self.destroyed) return
  debug('destroy (error: %s)', err && err.message)
  self.destroyed = true
  self.ready = false

  if (typeof err === 'function') {
    onclose = err
    err = null
  }

  if (onclose) self.once('close', onclose)

  if (self._pc) {
    try {
      self._pc.close()
    } catch (err) {}

    self._pc.oniceconnectionstatechange = null
    self._pc.onsignalingstatechange = null
    self._pc.onicecandidate = null
  }

  if (self._channel) {
    try {
      self._channel.close()
    } catch (err) {}

    self._channel.onmessage = null
    self._channel.onopen = null
    self._channel.onclose = null
  }
  self._pc = null
  self._channel = null

  self._dataStreams.forEach(function (stream) {
    if (err) stream.emit('error', err)
    if (!stream._readableState.ended) stream.push(null)
    if (!stream._writableState.finished) stream.end()
  })
  self._dataStreams = []

  if (err) self.emit('error', err)
  self.emit('close')
}

Peer.prototype.getDataStream = function (opts) {
  var self = this
  if (self.destroyed) throw new Error('peer is destroyed')
  var dataStream = new DataStream(extend({ _peer: self }, opts))
  self._dataStreams.push(dataStream)
  return dataStream
}

Peer.prototype._setupData = function (event) {
  var self = this
  self._channel = event.channel
  self.channelName = self._channel.label

  self._channel.binaryType = 'arraybuffer'
  self._channel.onmessage = self._onChannelMessage.bind(self)
  self._channel.onopen = self._onChannelOpen.bind(self)
  self._channel.onclose = self._onChannelClose.bind(self)
}

Peer.prototype._setupVideo = function (stream) {
  var self = this
  self._pc.addStream(stream)
}

Peer.prototype._onIceConnectionStateChange = function () {
  var self = this
  if (self.destroyed) return
  var iceGatheringState = self._pc.iceGatheringState
  var iceConnectionState = self._pc.iceConnectionState
  self.emit('iceConnectionStateChange', iceGatheringState, iceConnectionState)
  debug('iceConnectionStateChange %s %s', iceGatheringState, iceConnectionState)
  if (iceConnectionState === 'connected' || iceConnectionState === 'completed') {
    self._pcReady = true
    self._maybeReady()
  }
  if (iceConnectionState === 'disconnected' || iceConnectionState === 'closed')
    self.destroy()
}

Peer.prototype._maybeReady = function () {
  var self = this
  debug('maybeReady pc %s channel %s', self._pcReady, self._channelReady)
  if (!self.ready && self._pcReady && self._channelReady) {
    debug('ready')
    self.ready = true
    self.emit('ready')
  }
}

Peer.prototype._onSignalingStateChange = function () {
  var self = this
  if (self.destroyed) return
  self.emit('signalingStateChange', self._pc.signalingState)
  debug('signalingStateChange %s', self._pc.signalingState)
}

Peer.prototype._onIceCandidate = function (event) {
  var self = this
  if (self.destroyed) return
  if (event.candidate && self.trickle) {
    self.emit('signal', { candidate: event.candidate })
  } else if (!event.candidate) {
    self._iceComplete = true
    self.emit('_iceComplete')
  }
}

Peer.prototype._onChannelMessage = function (event) {
  var self = this
  if (self.destroyed) return
  var data = event.data
  debug('receive %s', data)

  if (data instanceof ArrayBuffer) {
    data = toBuffer(new Uint8Array(data))
    self.emit('message', data)
  } else {
    try {
      self.emit('message', JSON.parse(data))
    } catch (err) {
      self.emit('message', data)
    }
  }
  self._dataStreams.forEach(function (stream) {
    stream.push(data)
  })
}

Peer.prototype._onChannelOpen = function () {
  var self = this
  if (self.destroyed) return
  self._channelReady = true
  self._maybeReady()
}

Peer.prototype._onChannelClose = function () {
  var self = this
  if (self.destroyed) return
  self._channelReady = false
  self.destroy()
}

Peer.prototype._onAddStream = function (event) {
  var self = this
  if (self.destroyed) return
  self.emit('stream', event.stream)
}

Peer.prototype._onError = function (err) {
  var self = this
  if (self.destroyed) return
  debug('error %s', err.message)
  self.destroy(err)
}

// Duplex Stream for data channel

inherits(DataStream, stream.Duplex)

function DataStream (opts) {
  var self = this
  stream.Duplex.call(self, opts)
  self._peer = opts._peer
  debug('new stream')
}

DataStream.prototype.destroy = function () {
  var self = this
  self._peer.destroy()
}

DataStream.prototype._read = function () {}

DataStream.prototype._write = function (chunk, encoding, cb) {
  var self = this
  self._peer.send(chunk, cb)
}

function speedHack (obj) {
  var s = obj.sdp.split('b=AS:30')
  if (s.length > 1)
    obj.sdp = s[0] + 'b=AS:1638400' + s[1]
}

},{"debug":21,"events":76,"extend.js":50,"hat":28,"inherits":29,"is-typedarray":52,"once":32,"stream":92,"typedarray-to-buffer":53}],52:[function(require,module,exports){
arguments[4][16][0].apply(exports,arguments)
},{"dup":16}],53:[function(require,module,exports){
(function (Buffer){
/**
 * Convert a typed array to a Buffer without a copy
 *
 * Author:   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * License:  MIT
 *
 * `npm install typedarray-to-buffer`
 */

var isTypedArray = require('is-typedarray').strict

module.exports = function (arr) {
  // If `Buffer` is the browser `buffer` module, and the browser supports typed arrays,
  // then avoid a copy. Otherwise, create a `Buffer` with a copy.
  var constructor = Buffer.TYPED_ARRAY_SUPPORT
    ? Buffer._augment
    : function (arr) { return new Buffer(arr) }

  if (arr instanceof Uint8Array) {
    return constructor(arr)
  } else if (arr instanceof ArrayBuffer) {
    return constructor(new Uint8Array(arr))
  } else if (isTypedArray(arr)) {
    // Use the typed array's underlying ArrayBuffer to back new Buffer. This respects
    // the "view" on the ArrayBuffer, i.e. byteOffset and byteLength. No copy.
    return constructor(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength))
  } else {
    // Unsupported type, just pass it through to the `Buffer` constructor.
    return new Buffer(arr)
  }
}

}).call(this,require("buffer").Buffer)

},{"buffer":72,"is-typedarray":52}],54:[function(require,module,exports){
module.exports = Socket

var EventEmitter = require('events').EventEmitter
var inherits = require('inherits')
var once = require('once')

var RECONNECT_TIMEOUT = 5000

inherits(Socket, EventEmitter)

function Socket (url, opts) {
  if (!(this instanceof Socket)) return new Socket(url, opts)
  EventEmitter.call(this)
  if (!opts) opts = {}

  this._url = url
  this._reconnect = (opts.reconnect !== undefined)
    ? opts.reconnect
    : RECONNECT_TIMEOUT
  this._init()
}

Socket.prototype.send = function (message) {
  if (this._ws && this._ws.readyState === WebSocket.OPEN) {
    if (typeof message === 'object')
      message = JSON.stringify(message)
    this._ws.send(message)
  }
}

Socket.prototype.destroy = function (onclose) {
  if (onclose) this.once('close', onclose)
  try {
    this._ws.close()
  } catch (err) {
    this._onclose()
  }
}

Socket.prototype._init = function () {
  this._errored = false
  this._ws = new WebSocket(this._url)
  this._ws.onopen = this._onopen.bind(this)
  this._ws.onmessage = this._onmessage.bind(this)
  this._ws.onclose = this._onclose.bind(this)
  this._ws.onerror = once(this._onerror.bind(this))
}

Socket.prototype._onopen = function () {
  this.emit('ready')
}

Socket.prototype._onerror = function (err) {
  this._errored = true

  // On error, close socket...
  this.destroy()

  // ...and try to reconnect after a timeout
  if (this._reconnect) {
    this._timeout = setTimeout(this._init.bind(this), this._reconnect)
    this.emit('warning', err)
  } else {
    this.emit('error', err)
  }
}


Socket.prototype._onmessage = function (event) {
  var message = event.data
  try {
    message = JSON.parse(event.data)
  } catch (err) {}
  this.emit('message', message)
}

Socket.prototype._onclose = function () {
  clearTimeout(this._timeout)
  if (this._ws) {
    this._ws.onopen = null
    this._ws.onerror = null
    this._ws.onmessage = null
    this._ws.onclose = null
  }
  this._ws = null
  if (!this._errored) this.emit('close')
}

},{"events":76,"inherits":29,"once":32}],55:[function(require,module,exports){
(function (Buffer){
var bencode = require('bencode')
var BitField = require('bitfield')
var EventEmitter = require('events').EventEmitter
var inherits = require('inherits')
var sha1 = require('simple-sha1')

var MAX_METADATA_SIZE = 10000000 // 10MB
var BITFIELD_GROW = 1000
var PIECE_LENGTH = 16 * 1024

module.exports = function (metadata) {

  inherits(ut_metadata, EventEmitter)

  function ut_metadata (wire) {
    EventEmitter.call(this)

    this._wire = wire

    this._metadataComplete = false
    this._metadataSize = null
    this._remainingRejects = null // how many reject messages to tolerate before quitting
    this._fetching = false

    // The largest .torrent file that I know of is ~1-2MB, which is ~100 pieces.
    // Therefore, cap the bitfield to 10x that (1000 pieces) so a malicious peer can't
    // make it grow to fill all memory.
    this._bitfield = new BitField(0, { grow: BITFIELD_GROW })

    if (Buffer.isBuffer(metadata)) {
      this.setMetadata(metadata)
    }
  }

  // Name of the bittorrent-protocol extension
  ut_metadata.prototype.name = 'ut_metadata'

  ut_metadata.prototype.onHandshake = function (infoHash, peerId, extensions) {
    this._infoHash = infoHash
    this._infoHashHex = infoHash.toString('hex')
  }

  ut_metadata.prototype.onExtendedHandshake = function (handshake) {
    if (!handshake.m || !handshake.m.ut_metadata) {
      return this.emit('warning', new Error('Peer does not support ut_metadata'))
    }
    if (!handshake.metadata_size) {
      return this.emit('warning', new Error('Peer does not have metadata'))
    }

    if (handshake.metadata_size > MAX_METADATA_SIZE) {
      return this.emit('warning', new Error('Peer gave maliciously large metadata size'))
    }

    this._metadataSize = handshake.metadata_size
    this._numPieces = Math.ceil(this._metadataSize / PIECE_LENGTH)
    this._remainingRejects = this._numPieces * 2

    if (this._fetching) {
      this._requestPieces()
    }
  }

  ut_metadata.prototype.onMessage = function (buf) {
    var dict, trailer
    try {
      var str = buf.toString()
      var trailerIndex = str.indexOf('ee') + 2
      dict = bencode.decode(str.substring(0, trailerIndex))
      trailer = buf.slice(trailerIndex)
    } catch (err) {
      // drop invalid messages
      return
    }

    switch (dict.msg_type) {
      case 0:
        // ut_metadata request (from peer)
        // example: { 'msg_type': 0, 'piece': 0 }
        this._onRequest(dict.piece)
        break
      case 1:
        // ut_metadata data (in response to our request)
        // example: { 'msg_type': 1, 'piece': 0, 'total_size': 3425 }
        this._onData(dict.piece, trailer, dict.total_size)
        break
      case 2:
        // ut_metadata reject (peer doesn't have piece we requested)
        // { 'msg_type': 2, 'piece': 0 }
        this._onReject(dict.piece)
        break
    }
  }

  /**
   * Ask the peer to send metadata.
   * @public
   */
  ut_metadata.prototype.fetch = function () {
    if (this._metadataComplete) {
      return
    }
    this._fetching = true
    if (this._metadataSize) {
      this._requestPieces()
    }
  }

  /**
   * Stop asking the peer to send metadata.
   * @public
   */
  ut_metadata.prototype.cancel = function () {
    this._fetching = false
  }

  ut_metadata.prototype.setMetadata = function (metadata) {
    if (this._metadataComplete) return true

    // if full torrent dictionary was passed in, pull out just `info` key
    try {
      var info = bencode.decode(metadata).info
      if (info) {
        metadata = bencode.encode(info)
      }
    } catch (err) {}

    // check hash
    if (this._infoHashHex && this._infoHashHex !== sha1.sync(metadata)) {
      return false
    }

    this.cancel()

    this.metadata = metadata
    this._metadataComplete = true
    this._metadataSize = this.metadata.length
    this._wire.extendedHandshake.metadata_size = this._metadataSize

    this.emit('metadata', bencode.encode({ info: bencode.decode(this.metadata) }))

    return true
  }

  ut_metadata.prototype._send = function (dict, trailer) {
    var buf = bencode.encode(dict)
    if (Buffer.isBuffer(trailer)) {
      buf = Buffer.concat([buf, trailer])
    }
    this._wire.extended('ut_metadata', buf)
  }

  ut_metadata.prototype._request = function (piece) {
    this._send({ msg_type: 0, piece: piece })
  }

  ut_metadata.prototype._data = function (piece, buf, totalSize) {
    var msg = { msg_type: 1, piece: piece }
    if (typeof totalSize === 'number') {
      msg.total_size = totalSize
    }
    this._send(msg, buf)
  }

  ut_metadata.prototype._reject = function (piece) {
    this._send({ msg_type: 2, piece: piece })
  }

  ut_metadata.prototype._onRequest = function (piece) {
    if (!this._metadataComplete) {
      this._reject(piece)
      return
    }
    var start = piece * PIECE_LENGTH
    var end = start + PIECE_LENGTH
    if (end > this._metadataSize) {
      end = this._metadataSize
    }
    var buf = this.metadata.slice(start, end)
    this._data(piece, buf, this._metadataSize)
  }

  ut_metadata.prototype._onData = function (piece, buf, totalSize) {
    if (buf.length > PIECE_LENGTH) {
      return
    }
    buf.copy(this.metadata, piece * PIECE_LENGTH)
    this._bitfield.set(piece)
    this._checkDone()
  }

  ut_metadata.prototype._onReject = function (piece) {
    if (this._remainingRejects > 0 && this._fetching) {
      // If we haven't been rejected too much, then try to request the piece again
      this._request(piece)
      this._remainingRejects -= 1
    } else {
      this.emit('warning', new Error('Peer sent "reject" too much'))
    }
  }

  ut_metadata.prototype._requestPieces = function () {
    this.metadata = new Buffer(this._metadataSize)

    for (var piece = 0; piece < this._numPieces; piece++) {
      this._request(piece)
    }
  }

  ut_metadata.prototype._checkDone = function () {
    var done = true
    for (var piece = 0; piece < this._numPieces; piece++) {
      if (!this._bitfield.get(piece)) {
        done = false
        break
      }
    }
    if (!done) return

    // attempt to set metadata -- may fail sha1 check
    var success = this.setMetadata(this.metadata)

    if (!success) {
      this._failedMetadata()
    }
  }

  ut_metadata.prototype._failedMetadata = function () {
    // reset bitfield & try again
    this._bitfield = new BitField(0, { grow: BITFIELD_GROW })
    this._remainingRejects -= this._numPieces
    if (this._remainingRejects > 0) {
      this._requestPieces()
    } else {
      this.emit('warning', new Error('Peer sent invalid metadata'))
    }
  }

  return ut_metadata
}

}).call(this,require("buffer").Buffer)

},{"bencode":56,"bitfield":8,"buffer":72,"events":76,"inherits":29,"simple-sha1":45}],56:[function(require,module,exports){
arguments[4][11][0].apply(exports,arguments)
},{"./lib/decode":57,"./lib/encode":59,"dup":11}],57:[function(require,module,exports){
(function (Buffer){
var Dict = require("./dict")

/**
 * Decodes bencoded data.
 *
 * @param  {Buffer} data
 * @param  {String} encoding
 * @return {Object|Array|Buffer|String|Number}
 */
function decode( data, encoding ) {

  decode.position = 0
  decode.encoding = encoding || null

  decode.data = !( Buffer.isBuffer(data) )
    ? new Buffer( data )
    : data

  return decode.next()

}

decode.position = 0
decode.data     = null
decode.encoding = null

decode.next = function() {

  switch( decode.data[decode.position] ) {
    case 0x64: return decode.dictionary(); break
    case 0x6C: return decode.list(); break
    case 0x69: return decode.integer(); break
    default:   return decode.bytes(); break
  }

}

decode.find = function( chr ) {

  var i = decode.position
  var c = decode.data.length
  var d = decode.data

  while( i < c ) {
    if( d[i] === chr )
      return i
    i++
  }

  throw new Error(
    'Invalid data: Missing delimiter "' +
    String.fromCharCode( chr ) + '" [0x' +
    chr.toString( 16 ) + ']'
  )

}

decode.dictionary = function() {

  decode.position++

  var dict = new Dict()

  while( decode.data[decode.position] !== 0x65 ) {
    dict.binarySet(decode.bytes(), decode.next())
  }

  decode.position++

  return dict

}

decode.list = function() {

  decode.position++

  var lst = []

  while( decode.data[decode.position] !== 0x65 ) {
    lst.push( decode.next() )
  }

  decode.position++

  return lst

}

decode.integer = function() {

  var end    = decode.find( 0x65 )
  var number = decode.data.toString( 'ascii', decode.position + 1, end )

  decode.position += end + 1 - decode.position

  return parseInt( number, 10 )

}

decode.bytes = function() {

  var sep    = decode.find( 0x3A )
  var length = parseInt( decode.data.toString( 'ascii', decode.position, sep ), 10 )
  var end    = ++sep + length

  decode.position = end

  return decode.encoding
    ? decode.data.toString( decode.encoding, sep, end )
    : decode.data.slice( sep, end )

}

// Exports
module.exports = decode

}).call(this,require("buffer").Buffer)

},{"./dict":58,"buffer":72}],58:[function(require,module,exports){
arguments[4][13][0].apply(exports,arguments)
},{"dup":13}],59:[function(require,module,exports){
(function (Buffer){
/**
 * Encodes data in bencode.
 *
 * @param  {Buffer|Array|String|Object|Number} data
 * @return {Buffer}
 */
function encode( data ) {
  var buffers = []
  encode._encode( buffers, data )
  return Buffer.concat( buffers )
}

encode._floatConversionDetected = false

encode._encode = function( buffers, data ) {

  if( Buffer.isBuffer(data) ) {
    buffers.push(new Buffer(data.length + ':'))
    buffers.push(data)
    return;
  }

  switch( typeof data ) {
    case 'string':
      encode.bytes( buffers, data )
      break
    case 'number':
      encode.number( buffers, data )
      break
    case 'object':
      data.constructor === Array
        ? encode.list( buffers, data )
        : encode.dict( buffers, data )
      break
  }

}

var buff_e = new Buffer('e')
  , buff_d = new Buffer('d')
  , buff_l = new Buffer('l')

encode.bytes = function( buffers, data ) {

  buffers.push( new Buffer(Buffer.byteLength( data ) + ':' + data) )
}

encode.number = function( buffers, data ) {
  var maxLo = 0x80000000
  var hi = ( data / maxLo ) << 0
  var lo = ( data % maxLo  ) << 0
  var val = hi * maxLo + lo

  buffers.push( new Buffer( 'i' + val + 'e' ))

  if( val !== data && !encode._floatConversionDetected ) {
    encode._floatConversionDetected = true
    console.warn(
      'WARNING: Possible data corruption detected with value "'+data+'":',
      'Bencoding only defines support for integers, value was converted to "'+val+'"'
    )
    console.trace()
  }

}

encode.dict = function( buffers, data ) {

  buffers.push( buff_d )

  var j = 0
  var k
  // fix for issue #13 - sorted dicts
  var keys = Object.keys( data ).sort()
  var kl = keys.length

  for( ; j < kl ; j++) {
    k=keys[j]
    encode.bytes( buffers, k )
    encode._encode( buffers, data[k] )
  }

  buffers.push( buff_e )
}

encode.list = function( buffers, data ) {

  var i = 0, j = 1
  var c = data.length
  buffers.push( buff_l )

  for( ; i < c; i++ ) {
    encode._encode( buffers, data[i] )
  }

  buffers.push( buff_e )

}

// Expose
module.exports = encode

}).call(this,require("buffer").Buffer)

},{"buffer":72}],60:[function(require,module,exports){
(function (Buffer){
// TODO: don't return offer when we're at capacity. the approach of not sending handshake
//       wastes webrtc connections which are a more limited resource

module.exports = Swarm

var debug = require('debug')('webtorrent-swarm')
var EventEmitter = require('events').EventEmitter
var inherits = require('inherits')
var once = require('once')
var speedometer = require('speedometer')
var Wire = require('bittorrent-protocol')

var MAX_PEERS = 30
var HANDSHAKE_TIMEOUT = 25000

/**
 * Peer
 * A peer in the swarm. Comprised of a `SimplePeer` and a `Wire`.
 *
 * @param {Swarm} swarm
 * @param {stream.Duplex} stream a duplex stream to the remote peer
 * @param {string} id remote peerId
 */
function Peer (swarm, stream, id) {
  this.swarm = swarm
  this.stream = stream
  this.id = id

  var wire = this.wire = new Wire()
  this.timeout = null
  this.handshaked = false
  this.paused = true

  var destroy = once(function () {
    if (this.handshaked)
      this.swarm.wires.splice(this.swarm.wires.indexOf(this.wire), 1)
    this.destroy()
    this.swarm._drain()
    this.swarm._peers[this.id] = null
  }.bind(this))

  // Destroy the peer when the stream/wire is done or emits an error.
  stream.once('end', destroy)
  stream.once('error', destroy)
  stream.once('close', destroy)
  stream.once('finish', destroy)

  wire.once('end', destroy)
  wire.once('close', destroy)
  wire.once('error', destroy)
  wire.once('finish', destroy)

  wire.on('handshake', this._onHandshake.bind(this))

  // Duplex streaming magic!
  stream.pipe(wire).pipe(stream)
}

Peer.prototype.destroy = function () {
  debug('peer destroy')
  if (this.stream) this.stream.destroy()
  if (this.wire) this.wire.destroy()
  if (this.timeout) clearTimeout(this.timeout)
  this.stream = null
  this.wire = null
  this.timeout = null
}

/**
 * Send a handshake to the remote peer. This is called by _drain() when there is room
 * for a new peer in this swarm. Even if the remote peer sends us a handshake, we might
 * not send a return handshake. This is how we rate-limit when there are too many peers;
 * without a return handshake the remote peer won't start sending us data or piece
 * requests.
 */
Peer.prototype.handshake = function () {
  this.paused = false
  this.wire.handshake(this.swarm.infoHash, this.swarm.peerId, this.swarm.handshake)
  debug('sent handshake i %s p %s', this.swarm.infoHashHex, this.swarm.peerIdHex)

  if (!this.handshaked) {
    // Peer must respond to handshake in timely manner
    this.timeout = setTimeout(function () {
      this.destroy()
    }.bind(this), HANDSHAKE_TIMEOUT)
  }
}

/**
 * Called whenever we've handshaken with a new wire.
 * @param  {string} infoHash
 */
Peer.prototype._onHandshake = function (infoHash) {
  var infoHashHex = infoHash.toString('hex')
  debug('got handshake %s', infoHashHex)

  if (this.swarm.destroyed || infoHashHex !== this.swarm.infoHashHex)
    return this.destroy()

  this.handshaked = true
  clearTimeout(this.timeout)

  // Track total bytes downloaded by the swarm
  this.wire.on('download', function (downloaded) {
    this.swarm.downloaded += downloaded
    this.swarm.downloadSpeed(downloaded)
    this.swarm.emit('download', downloaded)
  }.bind(this))

  // Track total bytes uploaded by the swarm
  this.wire.on('upload', function (uploaded) {
    this.swarm.uploaded += uploaded
    this.swarm.uploadSpeed(uploaded)
    this.swarm.emit('upload', uploaded)
  }.bind(this))

  this.swarm.wires.push(this.wire)
  this.swarm.emit('wire', this.wire)
}

inherits(Swarm, EventEmitter)

/**
 * Swarm
 * =====
 * Abstraction of a BitTorrent "swarm", which is handy for managing all peer
 * connections for a given torrent download. This handles connecting to peers,
 * listening for incoming connections, and doing the initial peer wire protocol
 * handshake with peers. It also tracks total data uploaded/downloaded to/from
 * the swarm.
 *
 * Events: wire, download, upload, error, close
 *
 * @param {Buffer|string} infoHash
 * @param {Buffer|string} peerId
 * @param {Object} opts
 */
function Swarm (infoHash, peerId, opts) {
  if (!(this instanceof Swarm)) return new Swarm(infoHash, peerId, opts)
  EventEmitter.call(this)
  if (!opts) opts = {}

  this.infoHash = typeof infoHash === 'string'
    ? new Buffer(infoHash, 'hex')
    : infoHash
  this.infoHashHex = this.infoHash.toString('hex')

  this.peerId = typeof peerId === 'string'
    ? new Buffer(peerId, 'hex')
    : peerId
  this.peerIdHex = this.peerId.toString('hex')

  debug('new swarm i %s p %s', this.infoHashHex, this.peerIdHex)

  this.handshake = opts.handshake // handshake extensions
  this.maxPeers = opts.maxPeers || MAX_PEERS

  this.downloaded = 0
  this.uploaded = 0
  this.downloadSpeed = speedometer()
  this.uploadSpeed = speedometer()

  this.wires = [] // open wires (added *after* handshake)
  this._queue = [] // queue of peers to attempt handshake with
  this._peers = {} // connected peers (peerId -> Peer)

  this.paused = false
  this.destroyed = false
}

Object.defineProperty(Swarm.prototype, 'ratio', {
  get: function () {
    if (this.downloaded === 0)
      return 0
    else
      return this.uploaded / this.downloaded
  }
})

Object.defineProperty(Swarm.prototype, 'numQueued', {
  get: function () {
    return this._queue.length
  }
})

Object.defineProperty(Swarm.prototype, 'numPeers', {
  get: function () {
    return this.wires.length
  }
})

/**
 * Add a peer to the swarm.
 * @param {SimplePeer} simplePeer     simple peer instance to remote peer
 * @param {string}     simplePeer.id  peer id
 */
Swarm.prototype.addPeer = function (simplePeer) {
  if (this.destroyed) return
  if (this._peers[simplePeer.id]) return
  var stream = simplePeer.getDataStream()
  var peer = new Peer(this, stream, simplePeer.id)
  this._peers[simplePeer.id] = peer
  this._queue.push(peer)
  this._drain()
}

/**
 * Temporarily stop connecting to new peers. Note that this does not pause new
 * incoming connections, nor does it pause the streams of existing connections
 * or their wires.
 */
Swarm.prototype.pause = function () {
  debug('pause')
  this.paused = true
}

/**
 * Resume connecting to new peers.
 */
Swarm.prototype.resume = function () {
  debug('resume')
  this.paused = false
  this._drain()
}

/**
 * Remove a peer from the swarm.
 * @param  {string} peer  simple-peer instance
 */
Swarm.prototype.removePeer = function (peer) {
  debug('removePeer %s', peer)
  this._removePeer(peer)
  this._drain()
}

/**
 * Private method to remove a peer from the swarm without calling _drain().
 * @param  {string} peer  simple-peer instance
 */
Swarm.prototype._removePeer = function (peer) {
  debug('_removePeer %s', peer)
  peer.destroy()
}

/**
 * Destroy the swarm, close all open peer connections, and do cleanup.
 * @param {function} onclose
 */
Swarm.prototype.destroy = function (onclose) {
  if (this.destroyed) return
  this.destroyed = true
  if (onclose) this.once('close', onclose)

  debug('destroy')

  for (var peer in this._peers) {
    this._removePeer(peer)
  }

  this.emit('close')
}

/**
 * Pop a peer off the FIFO queue and connect to it. When _drain() gets called,
 * the queue will usually have only one peer in it, except when there are too
 * many peers (over `this.maxPeers`) in which case they will just sit in the
 * queue until another connection closes.
 */
Swarm.prototype._drain = function () {
  if (this.paused || this.destroyed || this.numPeers >= this.maxPeers) return
  debug('drain %s queued %s peers %s max', this.numQueued, this.numPeers, this.maxPeers)
  var peer = this._queue.shift()
  if (peer) {
    peer.handshake()
  }
}

}).call(this,require("buffer").Buffer)

},{"bittorrent-protocol":61,"buffer":72,"debug":21,"events":76,"inherits":29,"once":32,"speedometer":47}],61:[function(require,module,exports){
(function (Buffer){
module.exports = Wire

var BitField = require('bitfield')
var bencode = require('bencode')
var debug = require('debug')('bittorrent-protocol')
var extend = require('xtend')
var inherits = require('inherits')
var speedometer = require('speedometer')
var stream = require('stream')

var BITFIELD_GROW = 400000

var MESSAGE_PROTOCOL = new Buffer('\u0013BitTorrent protocol')
var MESSAGE_KEEP_ALIVE = new Buffer([0x00, 0x00, 0x00, 0x00])
var MESSAGE_CHOKE = new Buffer([0x00, 0x00, 0x00, 0x01, 0x00])
var MESSAGE_UNCHOKE = new Buffer([0x00, 0x00, 0x00, 0x01, 0x01])
var MESSAGE_INTERESTED = new Buffer([0x00, 0x00, 0x00, 0x01, 0x02])
var MESSAGE_UNINTERESTED = new Buffer([0x00, 0x00, 0x00, 0x01, 0x03])

var MESSAGE_RESERVED = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
var MESSAGE_PORT = [0x00, 0x00, 0x00, 0x03, 0x09, 0x00, 0x00]

function Request (piece, offset, length, callback) {
  this.piece = piece
  this.offset = offset
  this.length = length
  this.callback = callback
}

inherits(Wire, stream.Duplex)

function Wire () {
  if (!(this instanceof Wire)) return new Wire()
  stream.Duplex.call(this)
  debug('new wire')

  this.amChoking = true // are we choking the peer?
  this.amInterested = false // are we interested in the peer?

  this.peerChoking = true // is the peer choking us?
  this.peerInterested = false // is the peer interested in us?

  // The largest torrent that I know of (the Geocities archive) is ~641 GB and has
  // ~41,000 pieces. Therefore, cap bitfield to 10x larger (400,000 bits) to support all
  // possible torrents but prevent malicious peers from growing bitfield to fill memory.
  this.peerPieces = new BitField(0, { grow: BITFIELD_GROW })

  this.peerExtensions = {}

  // outgoing
  this.requests = []
  // incoming
  this.peerRequests = []

  /** @type {Object} number -> string, ex: 1 -> 'ut_metadata' */
  this.extendedMapping = {}
  /** @type {Object} string -> number, ex: 9 -> 'ut_metadata' */
  this.peerExtendedMapping = {}

  /**
   * The extended handshake to send, minus the "m" field, which gets automatically
   * filled from `this.extendedMapping`.
   * @type {Object}
   */
  this.extendedHandshake = {}
  this.peerExtendedHandshake = {}

  /** @type {Object} string -> function, ex 'ut_metadata' -> ut_metadata() */
  this._ext = {}
  this._nextExt = 1

  this.uploaded = 0
  this.downloaded = 0
  this.uploadSpeed = speedometer()
  this.downloadSpeed = speedometer()

  this._keepAlive = null
  this._timeout = null
  this._timeoutMs = 0

  this.destroyed = false // was the wire ended by calling `destroy`?
  this._finished = false

  this._buffer = []
  this._bufferSize = 0
  this._parser = null
  this._parserSize = 0

  this.on('finish', this._onfinish)

  this._parseHandshake()
}

/**
 * Set whether to send a "keep-alive" ping (sent every 60s)
 * @param {boolean} enable
 */
Wire.prototype.setKeepAlive = function (enable) {
  clearInterval(this._keepAlive)
  if (enable === false) return
  this._keepAlive = setInterval(this._push.bind(this, MESSAGE_KEEP_ALIVE), 60000)
}

/**
 * Set the amount of time to wait before considering a request to be "timed out"
 * @param {number} ms
 */
Wire.prototype.setTimeout = function (ms) {
  this._clearTimeout()
  this._timeoutMs = ms
  this._updateTimeout()
}

Wire.prototype.destroy = function () {
  this.destroyed = true
  this.end()
}

Wire.prototype.end = function () {
  this._onUninterested()
  this._onChoke()
  stream.Duplex.prototype.end.apply(this, arguments)
}

//
// PROTOCOL EXTENSION API
//

Wire.prototype.use = function (Extension) {
  var name = Extension.prototype.name
  if (!name) {
    throw new Error('Extension API requires a named function, e.g. function name() {}')
  }

  var ext = this._nextExt
  var handler = new Extension(this)

  function noop () {}

  if (typeof handler.onHandshake !== 'function') {
    handler.onHandshake = noop
  }
  if (typeof handler.onExtendedHandshake !== 'function') {
    handler.onExtendedHandshake = noop
  }
  if (typeof handler.onMessage !== 'function') {
    handler.onMessage = noop
  }

  this.extendedMapping[ext] = name
  this._ext[name] = handler
  this[name] = handler

  this._nextExt += 1
}

//
// OUTGOING MESSAGES
//

/**
 * Message: "handshake" <pstrlen><pstr><reserved><info_hash><peer_id>
 * @param  {Buffer|string} infoHash (as Buffer or *hex* string)
 * @param  {Buffer|string} peerId
 * @param  {Object} extensions
 */
Wire.prototype.handshake = function (infoHash, peerId, extensions) {
  if (typeof infoHash === 'string') infoHash = new Buffer(infoHash, 'hex')
  if (typeof peerId === 'string') peerId = new Buffer(peerId, 'hex')
  if (infoHash.length !== 20 || peerId.length !== 20) {
    throw new Error('infoHash and peerId MUST have length 20')
  }

  var reserved = new Buffer(MESSAGE_RESERVED)

  // enable extended message
  reserved[5] |= 0x10

  if (extensions && extensions.dht) reserved[7] |= 1

  this._push(Buffer.concat([MESSAGE_PROTOCOL, reserved, infoHash, peerId]))
  this._handshakeSent = true

  if (this.peerExtensions.extended) {
    // Peer's handshake indicated support already
    // (incoming connection)
    this._sendExtendedHandshake()
  }
}

/* Peer supports BEP-0010, send extended handshake.
 *
 * This comes after the 'handshake' event to give the user a chance to populate
 * `this.extendedHandshake` and `this.extendedMapping` before the extended handshake
 * is sent to the remote peer.
 */
Wire.prototype._sendExtendedHandshake = function () {
  // Create extended message object from registered extensions
  var msg = extend(this.extendedHandshake)
  msg.m = {}
  for (var ext in this.extendedMapping) {
    var name = this.extendedMapping[ext]
    msg.m[name] = Number(ext)
  }

  // Send extended handshake
  this.extended(0, bencode.encode(msg))
}

/**
 * Message "choke": <len=0001><id=0>
 */
Wire.prototype.choke = function () {
  if (this.amChoking) return
  this.amChoking = true
  this.peerRequests.splice(0, this.peerRequests.length)
  this._push(MESSAGE_CHOKE)
}

/**
 * Message "unchoke": <len=0001><id=1>
 */
Wire.prototype.unchoke = function () {
  if (!this.amChoking) return
  this.amChoking = false
  this._push(MESSAGE_UNCHOKE)
}

/**
 * Message "interested": <len=0001><id=2>
 */
Wire.prototype.interested = function () {
  if (this.amInterested) return
  this.amInterested = true
  this._push(MESSAGE_INTERESTED)
}

/**
 * Message "uninterested": <len=0001><id=3>
 */
Wire.prototype.uninterested = function () {
  if (!this.amInterested) return
  this.amInterested = false
  this._push(MESSAGE_UNINTERESTED)
}

/**
 * Message "have": <len=0005><id=4><piece index>
 * @param  {number} index
 */
Wire.prototype.have = function (index) {
  this._message(4, [index], null)
}

/**
 * Message "bitfield": <len=0001+X><id=5><bitfield>
 * @param  {BitField|Buffer} bitfield
 */
Wire.prototype.bitfield = function (bitfield) {
  if (!Buffer.isBuffer(bitfield)) bitfield = bitfield.buffer
  this._message(5, [], bitfield)
}

/**
 * Message "request": <len=0013><id=6><index><begin><length>
 * @param  {number}   index
 * @param  {number}   offset
 * @param  {number}   length
 * @param  {function} cb
 */
Wire.prototype.request = function (index, offset, length, cb) {
  if (!cb) cb = function () {}

  if (this._finished) return cb(new Error('wire is closed'))
  if (this.peerChoking) return cb(new Error('peer is choking'))

  this.requests.push(new Request(index, offset, length, cb))
  this._updateTimeout()
  this._message(6, [index, offset, length], null)
}

/**
 * Message "piece": <len=0009+X><id=7><index><begin><block>
 * @param  {number} index
 * @param  {number} offset
 * @param  {Buffer} buffer
 */
Wire.prototype.piece = function (index, offset, buffer) {
  this.uploaded += buffer.length
  this.uploadSpeed(buffer.length)
  this.emit('upload', buffer.length)
  this._message(7, [index, offset], buffer)
}

/**
 * Message "cancel": <len=0013><id=8><index><begin><length>
 * @param  {number} index
 * @param  {number} offset
 * @param  {number} length
 */
Wire.prototype.cancel = function (index, offset, length) {
  this._callback(
    pull(this.requests, index, offset, length),
    new Error('request was cancelled'),
    null
  )
  this._message(8, [index, offset, length], null)
}

/**
 * Message: "port" <len=0003><id=9><listen-port>
 * @param {Number} port
 */
Wire.prototype.port = function (port) {
  var message = new Buffer(MESSAGE_PORT)
  message.writeUInt16BE(port, 5)
  this._push(message)
}

/**
 * Message: "extended" <len=0005+X><id=20><ext-number><payload>
 * @param  {number} ext
 * @param  {Object} obj
 */
Wire.prototype.extended = function (ext, obj) {
  if (typeof ext === 'string' && this.peerExtendedMapping[ext]) {
    ext = this.peerExtendedMapping[ext]
  }
  if (typeof ext === 'number') {
    var ext_id = new Buffer([ext])
    var buf = Buffer.isBuffer(obj) ? obj : bencode.encode(obj)

    this._message(20, [], Buffer.concat([ext_id, buf]))
  } else {
    throw new Error('Unrecognized extension: ' + ext)
  }
}

//
// INCOMING MESSAGES
//

Wire.prototype._onKeepAlive = function () {
  this.emit('keep-alive')
}

Wire.prototype._onHandshake = function (infoHash, peerId, extensions) {
  this.peerId = peerId
  this.peerExtensions = extensions
  this.emit('handshake', infoHash, peerId, extensions)

  var name
  for (name in this._ext) {
    this._ext[name].onHandshake(infoHash, peerId, extensions)
  }

  if (extensions.extended && this._handshakeSent) {
    // outgoing connection
    this._sendExtendedHandshake()
  }
}

Wire.prototype._onChoke = function () {
  this.peerChoking = true
  this.emit('choke')
  while (this.requests.length) {
    this._callback(this.requests.shift(), new Error('peer is choking'), null)
  }
}

Wire.prototype._onUnchoke = function () {
  this.peerChoking = false
  this.emit('unchoke')
}

Wire.prototype._onInterested = function () {
  this.peerInterested = true
  this.emit('interested')
}

Wire.prototype._onUninterested = function () {
  this.peerInterested = false
  this.emit('uninterested')
}

Wire.prototype._onHave = function (index) {
  if (this.peerPieces.get(index)) return

  this.peerPieces.set(index, true)
  this.emit('have', index)
}

Wire.prototype._onBitField = function (buffer) {
  this.peerPieces = new BitField(buffer)
  this.emit('bitfield', this.peerPieces)
}

Wire.prototype._onRequest = function (index, offset, length) {
  if (this.amChoking) return

  var respond = function (err, buffer) {
    if (request !== pull(this.peerRequests, index, offset, length)) return
    if (err) return
    this.piece(index, offset, buffer)
  }.bind(this)

  var request = new Request(index, offset, length, respond)
  this.peerRequests.push(request)
  this.emit('request', index, offset, length, respond)
}

Wire.prototype._onPiece = function (index, offset, buffer) {
  this._callback(pull(this.requests, index, offset, buffer.length), null, buffer)
  this.downloaded += buffer.length
  this.downloadSpeed(buffer.length)
  this.emit('download', buffer.length)
  this.emit('piece', index, offset, buffer)
}

Wire.prototype._onCancel = function (index, offset, length) {
  pull(this.peerRequests, index, offset, length)
  this.emit('cancel', index, offset, length)
}

Wire.prototype._onPort = function (port) {
  this.emit('port', port)
}

Wire.prototype._onExtended = function (ext, buf) {
  var info, name
  if (ext === 0 && (info = safeBdecode(buf))) {
    this.peerExtendedHandshake = info
    if (typeof info.m === 'object') {
      for (name in info.m) {
        this.peerExtendedMapping[name] = Number(info.m[name].toString())
      }
    }
    for (name in this._ext) {
      if (this.peerExtendedMapping[name]) {
        this._ext[name].onExtendedHandshake(this.peerExtendedHandshake)
      }
    }
    this.emit('extended', 'handshake', this.peerExtendedHandshake)
  } else {
    if (this.extendedMapping[ext]) {
      ext = this.extendedMapping[ext] // friendly name for extension
      if (this._ext[ext]) {
        // there is an registered extension handler, so call it
        this._ext[ext].onMessage(buf)
      }
    }
    this.emit('extended', ext, buf)
  }
}

Wire.prototype._onTimeout = function () {
  this._callback(this.requests.shift(), new Error('request has timed out'), null)
  this.emit('timeout')
}

//
// STREAM METHODS
//

/**
 * Push a message to the remote peer.
 * @param {Buffer} data
 */
Wire.prototype._push = function (data) {
  if (this._finished) return
  return this.push(data)
}

/**
 * Duplex stream method. Called whenever the upstream has data for us.
 * @param  {Buffer|string} data
 * @param  {string}   encoding
 * @param  {function} cb
 */
Wire.prototype._write = function (data, encoding, cb) {
  this._bufferSize += data.length
  this._buffer.push(data)

  while (this._bufferSize >= this._parserSize) {
    var buffer = (this._buffer.length === 1)
      ? this._buffer[0]
      : Buffer.concat(this._buffer)
    this._bufferSize -= this._parserSize
    this._buffer = this._bufferSize
      ? [buffer.slice(this._parserSize)]
      : []
    this._parser(buffer.slice(0, this._parserSize))
  }

  cb(null) // Signal that we're ready for more data
}

/**
 * Duplex stream method. Called whenever the downstream wants data. No-op
 * since we'll just push data whenever we get it. Extra data will be buffered
 * in memory (we don't want to apply backpressure to peers!).
 */
Wire.prototype._read = function () {}

Wire.prototype._callback = function (request, err, buffer) {
  if (!request) return

  this._clearTimeout()

  if (!this.peerChoking && !this._finished) this._updateTimeout()
  request.callback(err, buffer)
}

Wire.prototype._clearTimeout = function () {
  if (!this._timeout) return

  clearTimeout(this._timeout)
  this._timeout = null
}

Wire.prototype._updateTimeout = function () {
  if (!this._timeoutMs || !this.requests.length || this._timeout) return

  this._timeout = setTimeout(this._onTimeout.bind(this), this._timeoutMs)
}

Wire.prototype._parse = function (size, parser) {
  this._parserSize = size
  this._parser = parser
}

Wire.prototype._message = function (id, numbers, data) {
  var dataLength = data ? data.length : 0
  var buffer = new Buffer(5 + 4 * numbers.length)

  buffer.writeUInt32BE(buffer.length + dataLength - 4, 0)
  buffer[4] = id
  for (var i = 0; i < numbers.length; i++) {
    buffer.writeUInt32BE(numbers[i], 5 + 4 * i)
  }

  this._push(buffer)
  if (data) this._push(data)
}

Wire.prototype._onmessagelength = function (buffer) {
  var length = buffer.readUInt32BE(0)
  if (length > 0) {
    this._parse(length, this._onmessage)
  } else {
    this._onKeepAlive()
    this._parse(4, this._onmessagelength)
  }
}

Wire.prototype._onmessage = function (buffer) {
  this._parse(4, this._onmessagelength)
  switch (buffer[0]) {
    case 0:
      return this._onChoke()
    case 1:
      return this._onUnchoke()
    case 2:
      return this._onInterested()
    case 3:
      return this._onUninterested()
    case 4:
      return this._onHave(buffer.readUInt32BE(1))
    case 5:
      return this._onBitField(buffer.slice(1))
    case 6:
      return this._onRequest(buffer.readUInt32BE(1),
          buffer.readUInt32BE(5), buffer.readUInt32BE(9))
    case 7:
      return this._onPiece(buffer.readUInt32BE(1),
          buffer.readUInt32BE(5), buffer.slice(9))
    case 8:
      return this._onCancel(buffer.readUInt32BE(1),
          buffer.readUInt32BE(5), buffer.readUInt32BE(9))
    case 9:
      return this._onPort(buffer.readUInt16BE(1))
    case 20:
      return this._onExtended(buffer.readUInt8(1), buffer.slice(2))
    default:
      return this.emit('unknownmessage', buffer)
  }
}

Wire.prototype._parseHandshake = function () {
  this._parse(1, function (buffer) {
    var pstrlen = buffer.readUInt8(0)
    this._parse(pstrlen + 48, function (handshake) {
      var protocol = handshake.slice(0, pstrlen)
      if (protocol.toString() !== 'BitTorrent protocol') {
        debug('Error: wire not speaking BitTorrent protocol (%s)', protocol.toString())
        this.end()
        return
      }
      handshake = handshake.slice(pstrlen)
      this._onHandshake(handshake.slice(8, 28), handshake.slice(28, 48), {
        dht: !!(handshake[7] & 0x01), // see bep_0005
        extended: !!(handshake[5] & 0x10) // see bep_0010
      })
      this._parse(4, this._onmessagelength)
    }.bind(this))
  }.bind(this))
}

Wire.prototype._onfinish = function () {
  this._finished = true

  this.push(null) // stream cannot be half open, so signal the end of it
  while (this.read()) {} // consume and discard the rest of the stream data

  clearInterval(this._keepAlive)
  this._parse(Number.MAX_VALUE, function () {})
  this.peerRequests = []
  while (this.requests.length) {
    this._callback(this.requests.shift(), new Error('wire was closed'), null)
  }
}

function pull (requests, piece, offset, length) {
  for (var i = 0; i < requests.length; i++) {
    var req = requests[i]
    if (req.piece !== piece || req.offset !== offset || req.length !== length) continue

    if (i === 0) requests.shift()
    else requests.splice(i, 1)

    return req
  }
  return null
}

function safeBdecode (buf) {
  try {
    return bencode.decode(buf)
  } catch (e) {
    console.warn(e)
  }
}

}).call(this,require("buffer").Buffer)

},{"bencode":62,"bitfield":8,"buffer":72,"debug":21,"inherits":29,"speedometer":47,"stream":92,"xtend":66}],62:[function(require,module,exports){
arguments[4][11][0].apply(exports,arguments)
},{"./lib/decode":63,"./lib/encode":65,"dup":11}],63:[function(require,module,exports){
(function (Buffer){
var Dict = require("./dict")

/**
 * Decodes bencoded data.
 *
 * @param  {Buffer} data
 * @param  {String} encoding
 * @return {Object|Array|Buffer|String|Number}
 */
function decode( data, encoding ) {

  decode.position = 0
  decode.encoding = encoding || null

  decode.data = !( Buffer.isBuffer(data) )
    ? new Buffer( data )
    : data

  return decode.next()

}

decode.position = 0
decode.data     = null
decode.encoding = null

decode.next = function() {

  switch( decode.data[decode.position] ) {
    case 0x64: return decode.dictionary(); break
    case 0x6C: return decode.list(); break
    case 0x69: return decode.integer(); break
    default:   return decode.bytes(); break
  }

}

decode.find = function( chr ) {

  var i = decode.position
  var c = decode.data.length
  var d = decode.data

  while( i < c ) {
    if( d[i] === chr )
      return i
    i++
  }

  throw new Error(
    'Invalid data: Missing delimiter "' +
    String.fromCharCode( chr ) + '" [0x' +
    chr.toString( 16 ) + ']'
  )

}

decode.dictionary = function() {

  decode.position++

  var dict = new Dict()

  while( decode.data[decode.position] !== 0x65 ) {
    dict.binarySet(decode.bytes(), decode.next())
  }

  decode.position++

  return dict

}

decode.list = function() {

  decode.position++

  var lst = []

  while( decode.data[decode.position] !== 0x65 ) {
    lst.push( decode.next() )
  }

  decode.position++

  return lst

}

decode.integer = function() {

  var end    = decode.find( 0x65 )
  var number = decode.data.toString( 'ascii', decode.position + 1, end )

  decode.position += end + 1 - decode.position

  return parseInt( number, 10 )

}

decode.bytes = function() {

  var sep    = decode.find( 0x3A )
  var length = parseInt( decode.data.toString( 'ascii', decode.position, sep ), 10 )
  var end    = ++sep + length

  decode.position = end

  return decode.encoding
    ? decode.data.toString( decode.encoding, sep, end )
    : decode.data.slice( sep, end )

}

// Exports
module.exports = decode

}).call(this,require("buffer").Buffer)

},{"./dict":64,"buffer":72}],64:[function(require,module,exports){
arguments[4][13][0].apply(exports,arguments)
},{"dup":13}],65:[function(require,module,exports){
(function (Buffer){
/**
 * Encodes data in bencode.
 *
 * @param  {Buffer|Array|String|Object|Number} data
 * @return {Buffer}
 */
function encode( data ) {
  var buffers = []
  encode._encode( buffers, data )
  return Buffer.concat( buffers )
}

encode._floatConversionDetected = false

encode._encode = function( buffers, data ) {

  if( Buffer.isBuffer(data) ) {
    buffers.push(new Buffer(data.length + ':'))
    buffers.push(data)
    return;
  }

  switch( typeof data ) {
    case 'string':
      encode.bytes( buffers, data )
      break
    case 'number':
      encode.number( buffers, data )
      break
    case 'object':
      data.constructor === Array
        ? encode.list( buffers, data )
        : encode.dict( buffers, data )
      break
  }

}

var buff_e = new Buffer('e')
  , buff_d = new Buffer('d')
  , buff_l = new Buffer('l')

encode.bytes = function( buffers, data ) {

  buffers.push( new Buffer(Buffer.byteLength( data ) + ':' + data) )
}

encode.number = function( buffers, data ) {
  var maxLo = 0x80000000
  var hi = ( data / maxLo ) << 0
  var lo = ( data % maxLo  ) << 0
  var val = hi * maxLo + lo

  buffers.push( new Buffer( 'i' + val + 'e' ))

  if( val !== data && !encode._floatConversionDetected ) {
    encode._floatConversionDetected = true
    console.warn(
      'WARNING: Possible data corruption detected with value "'+data+'":',
      'Bencoding only defines support for integers, value was converted to "'+val+'"'
    )
    console.trace()
  }

}

encode.dict = function( buffers, data ) {

  buffers.push( buff_d )

  var j = 0
  var k
  // fix for issue #13 - sorted dicts
  var keys = Object.keys( data ).sort()
  var kl = keys.length

  for( ; j < kl ; j++) {
    k=keys[j]
    encode.bytes( buffers, k )
    encode._encode( buffers, data[k] )
  }

  buffers.push( buff_e )
}

encode.list = function( buffers, data ) {

  var i = 0, j = 1
  var c = data.length
  buffers.push( buff_l )

  for( ; i < c; i++ ) {
    encode._encode( buffers, data[i] )
  }

  buffers.push( buff_e )

}

// Expose
module.exports = encode

}).call(this,require("buffer").Buffer)

},{"buffer":72}],66:[function(require,module,exports){
module.exports = extend

function extend() {
    var target = {}

    for (var i = 0; i < arguments.length; i++) {
        var source = arguments[i]

        for (var key in source) {
            if (source.hasOwnProperty(key)) {
                target[key] = source[key]
            }
        }
    }

    return target
}

},{}],67:[function(require,module,exports){
module.exports = extend

function extend(target) {
    for (var i = 1; i < arguments.length; i++) {
        var source = arguments[i]

        for (var key in source) {
            if (source.hasOwnProperty(key)) {
                target[key] = source[key]
            }
        }
    }

    return target
}

},{}],68:[function(require,module,exports){
/**
 * Given a number, return a zero-filled string.
 * From http://stackoverflow.com/questions/1267283/
 * @param  {number} width
 * @param  {number} number
 * @return {string}
 */
module.exports = function zeroFill (width, number, pad) {
  if (number === undefined) {
    return function (number, pad) {
      return zeroFill(width, number, pad)
    }
  }
  if (pad === undefined) pad = '0'
  width -= number.toString().length
  if (width > 0) return new Array(width + (/\./.test(number) ? 2 : 1)).join(pad) + number
  return number + ''
}

},{}],69:[function(require,module,exports){

},{}],70:[function(require,module,exports){
// http://wiki.commonjs.org/wiki/Unit_Testing/1.0
//
// THIS IS NOT TESTED NOR LIKELY TO WORK OUTSIDE V8!
//
// Originally from narwhal.js (http://narwhaljs.org)
// Copyright (c) 2009 Thomas Robinson <280north.com>
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the 'Software'), to
// deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
// sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
// ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
// WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

// when used in node, this will actually load the util module we depend on
// versus loading the builtin util module as happens otherwise
// this is a bug in node module loading as far as I am concerned
var util = require('util/');

var pSlice = Array.prototype.slice;
var hasOwn = Object.prototype.hasOwnProperty;

// 1. The assert module provides functions that throw
// AssertionError's when particular conditions are not met. The
// assert module must conform to the following interface.

var assert = module.exports = ok;

// 2. The AssertionError is defined in assert.
// new assert.AssertionError({ message: message,
//                             actual: actual,
//                             expected: expected })

assert.AssertionError = function AssertionError(options) {
  this.name = 'AssertionError';
  this.actual = options.actual;
  this.expected = options.expected;
  this.operator = options.operator;
  if (options.message) {
    this.message = options.message;
    this.generatedMessage = false;
  } else {
    this.message = getMessage(this);
    this.generatedMessage = true;
  }
  var stackStartFunction = options.stackStartFunction || fail;

  if (Error.captureStackTrace) {
    Error.captureStackTrace(this, stackStartFunction);
  }
  else {
    // non v8 browsers so we can have a stacktrace
    var err = new Error();
    if (err.stack) {
      var out = err.stack;

      // try to strip useless frames
      var fn_name = stackStartFunction.name;
      var idx = out.indexOf('\n' + fn_name);
      if (idx >= 0) {
        // once we have located the function frame
        // we need to strip out everything before it (and its line)
        var next_line = out.indexOf('\n', idx + 1);
        out = out.substring(next_line + 1);
      }

      this.stack = out;
    }
  }
};

// assert.AssertionError instanceof Error
util.inherits(assert.AssertionError, Error);

function replacer(key, value) {
  if (util.isUndefined(value)) {
    return '' + value;
  }
  if (util.isNumber(value) && !isFinite(value)) {
    return value.toString();
  }
  if (util.isFunction(value) || util.isRegExp(value)) {
    return value.toString();
  }
  return value;
}

function truncate(s, n) {
  if (util.isString(s)) {
    return s.length < n ? s : s.slice(0, n);
  } else {
    return s;
  }
}

function getMessage(self) {
  return truncate(JSON.stringify(self.actual, replacer), 128) + ' ' +
         self.operator + ' ' +
         truncate(JSON.stringify(self.expected, replacer), 128);
}

// At present only the three keys mentioned above are used and
// understood by the spec. Implementations or sub modules can pass
// other keys to the AssertionError's constructor - they will be
// ignored.

// 3. All of the following functions must throw an AssertionError
// when a corresponding condition is not met, with a message that
// may be undefined if not provided.  All assertion methods provide
// both the actual and expected values to the assertion error for
// display purposes.

function fail(actual, expected, message, operator, stackStartFunction) {
  throw new assert.AssertionError({
    message: message,
    actual: actual,
    expected: expected,
    operator: operator,
    stackStartFunction: stackStartFunction
  });
}

// EXTENSION! allows for well behaved errors defined elsewhere.
assert.fail = fail;

// 4. Pure assertion tests whether a value is truthy, as determined
// by !!guard.
// assert.ok(guard, message_opt);
// This statement is equivalent to assert.equal(true, !!guard,
// message_opt);. To test strictly for the value true, use
// assert.strictEqual(true, guard, message_opt);.

function ok(value, message) {
  if (!value) fail(value, true, message, '==', assert.ok);
}
assert.ok = ok;

// 5. The equality assertion tests shallow, coercive equality with
// ==.
// assert.equal(actual, expected, message_opt);

assert.equal = function equal(actual, expected, message) {
  if (actual != expected) fail(actual, expected, message, '==', assert.equal);
};

// 6. The non-equality assertion tests for whether two objects are not equal
// with != assert.notEqual(actual, expected, message_opt);

assert.notEqual = function notEqual(actual, expected, message) {
  if (actual == expected) {
    fail(actual, expected, message, '!=', assert.notEqual);
  }
};

// 7. The equivalence assertion tests a deep equality relation.
// assert.deepEqual(actual, expected, message_opt);

assert.deepEqual = function deepEqual(actual, expected, message) {
  if (!_deepEqual(actual, expected)) {
    fail(actual, expected, message, 'deepEqual', assert.deepEqual);
  }
};

function _deepEqual(actual, expected) {
  // 7.1. All identical values are equivalent, as determined by ===.
  if (actual === expected) {
    return true;

  } else if (util.isBuffer(actual) && util.isBuffer(expected)) {
    if (actual.length != expected.length) return false;

    for (var i = 0; i < actual.length; i++) {
      if (actual[i] !== expected[i]) return false;
    }

    return true;

  // 7.2. If the expected value is a Date object, the actual value is
  // equivalent if it is also a Date object that refers to the same time.
  } else if (util.isDate(actual) && util.isDate(expected)) {
    return actual.getTime() === expected.getTime();

  // 7.3 If the expected value is a RegExp object, the actual value is
  // equivalent if it is also a RegExp object with the same source and
  // properties (`global`, `multiline`, `lastIndex`, `ignoreCase`).
  } else if (util.isRegExp(actual) && util.isRegExp(expected)) {
    return actual.source === expected.source &&
           actual.global === expected.global &&
           actual.multiline === expected.multiline &&
           actual.lastIndex === expected.lastIndex &&
           actual.ignoreCase === expected.ignoreCase;

  // 7.4. Other pairs that do not both pass typeof value == 'object',
  // equivalence is determined by ==.
  } else if (!util.isObject(actual) && !util.isObject(expected)) {
    return actual == expected;

  // 7.5 For all other Object pairs, including Array objects, equivalence is
  // determined by having the same number of owned properties (as verified
  // with Object.prototype.hasOwnProperty.call), the same set of keys
  // (although not necessarily the same order), equivalent values for every
  // corresponding key, and an identical 'prototype' property. Note: this
  // accounts for both named and indexed properties on Arrays.
  } else {
    return objEquiv(actual, expected);
  }
}

function isArguments(object) {
  return Object.prototype.toString.call(object) == '[object Arguments]';
}

function objEquiv(a, b) {
  if (util.isNullOrUndefined(a) || util.isNullOrUndefined(b))
    return false;
  // an identical 'prototype' property.
  if (a.prototype !== b.prototype) return false;
  // if one is a primitive, the other must be same
  if (util.isPrimitive(a) || util.isPrimitive(b)) {
    return a === b;
  }
  var aIsArgs = isArguments(a),
      bIsArgs = isArguments(b);
  if ((aIsArgs && !bIsArgs) || (!aIsArgs && bIsArgs))
    return false;
  if (aIsArgs) {
    a = pSlice.call(a);
    b = pSlice.call(b);
    return _deepEqual(a, b);
  }
  var ka = objectKeys(a),
      kb = objectKeys(b),
      key, i;
  // having the same number of owned properties (keys incorporates
  // hasOwnProperty)
  if (ka.length != kb.length)
    return false;
  //the same set of keys (although not necessarily the same order),
  ka.sort();
  kb.sort();
  //~~~cheap key test
  for (i = ka.length - 1; i >= 0; i--) {
    if (ka[i] != kb[i])
      return false;
  }
  //equivalent values for every corresponding key, and
  //~~~possibly expensive deep test
  for (i = ka.length - 1; i >= 0; i--) {
    key = ka[i];
    if (!_deepEqual(a[key], b[key])) return false;
  }
  return true;
}

// 8. The non-equivalence assertion tests for any deep inequality.
// assert.notDeepEqual(actual, expected, message_opt);

assert.notDeepEqual = function notDeepEqual(actual, expected, message) {
  if (_deepEqual(actual, expected)) {
    fail(actual, expected, message, 'notDeepEqual', assert.notDeepEqual);
  }
};

// 9. The strict equality assertion tests strict equality, as determined by ===.
// assert.strictEqual(actual, expected, message_opt);

assert.strictEqual = function strictEqual(actual, expected, message) {
  if (actual !== expected) {
    fail(actual, expected, message, '===', assert.strictEqual);
  }
};

// 10. The strict non-equality assertion tests for strict inequality, as
// determined by !==.  assert.notStrictEqual(actual, expected, message_opt);

assert.notStrictEqual = function notStrictEqual(actual, expected, message) {
  if (actual === expected) {
    fail(actual, expected, message, '!==', assert.notStrictEqual);
  }
};

function expectedException(actual, expected) {
  if (!actual || !expected) {
    return false;
  }

  if (Object.prototype.toString.call(expected) == '[object RegExp]') {
    return expected.test(actual);
  } else if (actual instanceof expected) {
    return true;
  } else if (expected.call({}, actual) === true) {
    return true;
  }

  return false;
}

function _throws(shouldThrow, block, expected, message) {
  var actual;

  if (util.isString(expected)) {
    message = expected;
    expected = null;
  }

  try {
    block();
  } catch (e) {
    actual = e;
  }

  message = (expected && expected.name ? ' (' + expected.name + ').' : '.') +
            (message ? ' ' + message : '.');

  if (shouldThrow && !actual) {
    fail(actual, expected, 'Missing expected exception' + message);
  }

  if (!shouldThrow && expectedException(actual, expected)) {
    fail(actual, expected, 'Got unwanted exception' + message);
  }

  if ((shouldThrow && actual && expected &&
      !expectedException(actual, expected)) || (!shouldThrow && actual)) {
    throw actual;
  }
}

// 11. Expected to throw an error:
// assert.throws(block, Error_opt, message_opt);

assert.throws = function(block, /*optional*/error, /*optional*/message) {
  _throws.apply(this, [true].concat(pSlice.call(arguments)));
};

// EXTENSION! This is annoying to write outside this module.
assert.doesNotThrow = function(block, /*optional*/message) {
  _throws.apply(this, [false].concat(pSlice.call(arguments)));
};

assert.ifError = function(err) { if (err) {throw err;}};

var objectKeys = Object.keys || function (obj) {
  var keys = [];
  for (var key in obj) {
    if (hasOwn.call(obj, key)) keys.push(key);
  }
  return keys;
};

},{"util/":95}],71:[function(require,module,exports){
arguments[4][69][0].apply(exports,arguments)
},{"dup":69}],72:[function(require,module,exports){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * @license  MIT
 */

var base64 = require('base64-js')
var ieee754 = require('ieee754')
var isArray = require('is-array')

exports.Buffer = Buffer
exports.SlowBuffer = SlowBuffer
exports.INSPECT_MAX_BYTES = 50
Buffer.poolSize = 8192 // not used by this implementation

var kMaxLength = 0x3fffffff
var rootParent = {}

/**
 * If `Buffer.TYPED_ARRAY_SUPPORT`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Use Object implementation (most compatible, even IE6)
 *
 * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
 * Opera 11.6+, iOS 4.2+.
 *
 * Note:
 *
 * - Implementation must support adding new properties to `Uint8Array` instances.
 *   Firefox 4-29 lacked support, fixed in Firefox 30+.
 *   See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438.
 *
 *  - Chrome 9-10 is missing the `TypedArray.prototype.subarray` function.
 *
 *  - IE10 has a broken `TypedArray.prototype.subarray` function which returns arrays of
 *    incorrect length in some situations.
 *
 * We detect these buggy browsers and set `Buffer.TYPED_ARRAY_SUPPORT` to `false` so they will
 * get the Object implementation, which is slower but will work correctly.
 */
Buffer.TYPED_ARRAY_SUPPORT = (function () {
  try {
    var buf = new ArrayBuffer(0)
    var arr = new Uint8Array(buf)
    arr.foo = function () { return 42 }
    return arr.foo() === 42 && // typed array instances can be augmented
        typeof arr.subarray === 'function' && // chrome 9-10 lack `subarray`
        new Uint8Array(1).subarray(1, 1).byteLength === 0 // ie10 has broken `subarray`
  } catch (e) {
    return false
  }
})()

/**
 * Class: Buffer
 * =============
 *
 * The Buffer constructor returns instances of `Uint8Array` that are augmented
 * with function properties for all the node `Buffer` API functions. We use
 * `Uint8Array` so that square bracket notation works as expected -- it returns
 * a single octet.
 *
 * By augmenting the instances, we can avoid modifying the `Uint8Array`
 * prototype.
 */
function Buffer (subject, encoding) {
  var self = this
  if (!(self instanceof Buffer)) return new Buffer(subject, encoding)

  var type = typeof subject
  var length

  if (type === 'number') {
    length = +subject
  } else if (type === 'string') {
    length = Buffer.byteLength(subject, encoding)
  } else if (type === 'object' && subject !== null) {
    // assume object is array-like
    if (subject.type === 'Buffer' && isArray(subject.data)) subject = subject.data
    length = +subject.length
  } else {
    throw new TypeError('must start with number, buffer, array or string')
  }

  if (length > kMaxLength) {
    throw new RangeError('Attempt to allocate Buffer larger than maximum size: 0x' +
      kMaxLength.toString(16) + ' bytes')
  }

  if (length < 0) length = 0
  else length >>>= 0 // coerce to uint32

  if (Buffer.TYPED_ARRAY_SUPPORT) {
    // Preferred: Return an augmented `Uint8Array` instance for best performance
    self = Buffer._augment(new Uint8Array(length)) // eslint-disable-line consistent-this
  } else {
    // Fallback: Return THIS instance of Buffer (created by `new`)
    self.length = length
    self._isBuffer = true
  }

  var i
  if (Buffer.TYPED_ARRAY_SUPPORT && typeof subject.byteLength === 'number') {
    // Speed optimization -- use set if we're copying from a typed array
    self._set(subject)
  } else if (isArrayish(subject)) {
    // Treat array-ish objects as a byte array
    if (Buffer.isBuffer(subject)) {
      for (i = 0; i < length; i++) {
        self[i] = subject.readUInt8(i)
      }
    } else {
      for (i = 0; i < length; i++) {
        self[i] = ((subject[i] % 256) + 256) % 256
      }
    }
  } else if (type === 'string') {
    self.write(subject, 0, encoding)
  } else if (type === 'number' && !Buffer.TYPED_ARRAY_SUPPORT) {
    for (i = 0; i < length; i++) {
      self[i] = 0
    }
  }

  if (length > 0 && length <= Buffer.poolSize) self.parent = rootParent

  return self
}

function SlowBuffer (subject, encoding) {
  if (!(this instanceof SlowBuffer)) return new SlowBuffer(subject, encoding)

  var buf = new Buffer(subject, encoding)
  delete buf.parent
  return buf
}

Buffer.isBuffer = function isBuffer (b) {
  return !!(b != null && b._isBuffer)
}

Buffer.compare = function compare (a, b) {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) {
    throw new TypeError('Arguments must be Buffers')
  }

  if (a === b) return 0

  var x = a.length
  var y = b.length
  for (var i = 0, len = Math.min(x, y); i < len && a[i] === b[i]; i++) {}
  if (i !== len) {
    x = a[i]
    y = b[i]
  }
  if (x < y) return -1
  if (y < x) return 1
  return 0
}

Buffer.isEncoding = function isEncoding (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'binary':
    case 'base64':
    case 'raw':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.concat = function concat (list, totalLength) {
  if (!isArray(list)) throw new TypeError('list argument must be an Array of Buffers.')

  if (list.length === 0) {
    return new Buffer(0)
  } else if (list.length === 1) {
    return list[0]
  }

  var i
  if (totalLength === undefined) {
    totalLength = 0
    for (i = 0; i < list.length; i++) {
      totalLength += list[i].length
    }
  }

  var buf = new Buffer(totalLength)
  var pos = 0
  for (i = 0; i < list.length; i++) {
    var item = list[i]
    item.copy(buf, pos)
    pos += item.length
  }
  return buf
}

Buffer.byteLength = function byteLength (str, encoding) {
  var ret
  str = str + ''
  switch (encoding || 'utf8') {
    case 'ascii':
    case 'binary':
    case 'raw':
      ret = str.length
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = str.length * 2
      break
    case 'hex':
      ret = str.length >>> 1
      break
    case 'utf8':
    case 'utf-8':
      ret = utf8ToBytes(str).length
      break
    case 'base64':
      ret = base64ToBytes(str).length
      break
    default:
      ret = str.length
  }
  return ret
}

// pre-set for values that may exist in the future
Buffer.prototype.length = undefined
Buffer.prototype.parent = undefined

// toString(encoding, start=0, end=buffer.length)
Buffer.prototype.toString = function toString (encoding, start, end) {
  var loweredCase = false

  start = start >>> 0
  end = end === undefined || end === Infinity ? this.length : end >>> 0

  if (!encoding) encoding = 'utf8'
  if (start < 0) start = 0
  if (end > this.length) end = this.length
  if (end <= start) return ''

  while (true) {
    switch (encoding) {
      case 'hex':
        return hexSlice(this, start, end)

      case 'utf8':
      case 'utf-8':
        return utf8Slice(this, start, end)

      case 'ascii':
        return asciiSlice(this, start, end)

      case 'binary':
        return binarySlice(this, start, end)

      case 'base64':
        return base64Slice(this, start, end)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return utf16leSlice(this, start, end)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = (encoding + '').toLowerCase()
        loweredCase = true
    }
  }
}

Buffer.prototype.equals = function equals (b) {
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  if (this === b) return true
  return Buffer.compare(this, b) === 0
}

Buffer.prototype.inspect = function inspect () {
  var str = ''
  var max = exports.INSPECT_MAX_BYTES
  if (this.length > 0) {
    str = this.toString('hex', 0, max).match(/.{2}/g).join(' ')
    if (this.length > max) str += ' ... '
  }
  return '<Buffer ' + str + '>'
}

Buffer.prototype.compare = function compare (b) {
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  if (this === b) return 0
  return Buffer.compare(this, b)
}

Buffer.prototype.indexOf = function indexOf (val, byteOffset) {
  if (byteOffset > 0x7fffffff) byteOffset = 0x7fffffff
  else if (byteOffset < -0x80000000) byteOffset = -0x80000000
  byteOffset >>= 0

  if (this.length === 0) return -1
  if (byteOffset >= this.length) return -1

  // Negative offsets start from the end of the buffer
  if (byteOffset < 0) byteOffset = Math.max(this.length + byteOffset, 0)

  if (typeof val === 'string') {
    if (val.length === 0) return -1 // special case: looking for empty string always fails
    return String.prototype.indexOf.call(this, val, byteOffset)
  }
  if (Buffer.isBuffer(val)) {
    return arrayIndexOf(this, val, byteOffset)
  }
  if (typeof val === 'number') {
    if (Buffer.TYPED_ARRAY_SUPPORT && Uint8Array.prototype.indexOf === 'function') {
      return Uint8Array.prototype.indexOf.call(this, val, byteOffset)
    }
    return arrayIndexOf(this, [ val ], byteOffset)
  }

  function arrayIndexOf (arr, val, byteOffset) {
    var foundIndex = -1
    for (var i = 0; byteOffset + i < arr.length; i++) {
      if (arr[byteOffset + i] === val[foundIndex === -1 ? 0 : i - foundIndex]) {
        if (foundIndex === -1) foundIndex = i
        if (i - foundIndex + 1 === val.length) return byteOffset + foundIndex
      } else {
        foundIndex = -1
      }
    }
    return -1
  }

  throw new TypeError('val must be string, number or Buffer')
}

// `get` will be removed in Node 0.13+
Buffer.prototype.get = function get (offset) {
  console.log('.get() is deprecated. Access using array indexes instead.')
  return this.readUInt8(offset)
}

// `set` will be removed in Node 0.13+
Buffer.prototype.set = function set (v, offset) {
  console.log('.set() is deprecated. Access using array indexes instead.')
  return this.writeUInt8(v, offset)
}

function hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  // must be an even number of digits
  var strLen = string.length
  if (strLen % 2 !== 0) throw new Error('Invalid hex string')

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; i++) {
    var parsed = parseInt(string.substr(i * 2, 2), 16)
    if (isNaN(parsed)) throw new Error('Invalid hex string')
    buf[offset + i] = parsed
  }
  return i
}

function utf8Write (buf, string, offset, length) {
  var charsWritten = blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length)
  return charsWritten
}

function asciiWrite (buf, string, offset, length) {
  var charsWritten = blitBuffer(asciiToBytes(string), buf, offset, length)
  return charsWritten
}

function binaryWrite (buf, string, offset, length) {
  return asciiWrite(buf, string, offset, length)
}

function base64Write (buf, string, offset, length) {
  var charsWritten = blitBuffer(base64ToBytes(string), buf, offset, length)
  return charsWritten
}

function utf16leWrite (buf, string, offset, length) {
  var charsWritten = blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length)
  return charsWritten
}

Buffer.prototype.write = function write (string, offset, length, encoding) {
  // Support both (string, offset, length, encoding)
  // and the legacy (string, encoding, offset, length)
  if (isFinite(offset)) {
    if (!isFinite(length)) {
      encoding = length
      length = undefined
    }
  } else {  // legacy
    var swap = encoding
    encoding = offset
    offset = length
    length = swap
  }

  offset = Number(offset) || 0

  if (length < 0 || offset < 0 || offset > this.length) {
    throw new RangeError('attempt to write outside buffer bounds')
  }

  var remaining = this.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }
  encoding = String(encoding || 'utf8').toLowerCase()

  var ret
  switch (encoding) {
    case 'hex':
      ret = hexWrite(this, string, offset, length)
      break
    case 'utf8':
    case 'utf-8':
      ret = utf8Write(this, string, offset, length)
      break
    case 'ascii':
      ret = asciiWrite(this, string, offset, length)
      break
    case 'binary':
      ret = binaryWrite(this, string, offset, length)
      break
    case 'base64':
      ret = base64Write(this, string, offset, length)
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = utf16leWrite(this, string, offset, length)
      break
    default:
      throw new TypeError('Unknown encoding: ' + encoding)
  }
  return ret
}

Buffer.prototype.toJSON = function toJSON () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

function base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function utf8Slice (buf, start, end) {
  var res = ''
  var tmp = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    if (buf[i] <= 0x7F) {
      res += decodeUtf8Char(tmp) + String.fromCharCode(buf[i])
      tmp = ''
    } else {
      tmp += '%' + buf[i].toString(16)
    }
  }

  return res + decodeUtf8Char(tmp)
}

function asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    ret += String.fromCharCode(buf[i] & 0x7F)
  }
  return ret
}

function binarySlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    ret += String.fromCharCode(buf[i])
  }
  return ret
}

function hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; i++) {
    out += toHex(buf[i])
  }
  return out
}

function utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256)
  }
  return res
}

Buffer.prototype.slice = function slice (start, end) {
  var len = this.length
  start = ~~start
  end = end === undefined ? len : ~~end

  if (start < 0) {
    start += len
    if (start < 0) start = 0
  } else if (start > len) {
    start = len
  }

  if (end < 0) {
    end += len
    if (end < 0) end = 0
  } else if (end > len) {
    end = len
  }

  if (end < start) end = start

  var newBuf
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    newBuf = Buffer._augment(this.subarray(start, end))
  } else {
    var sliceLen = end - start
    newBuf = new Buffer(sliceLen, undefined)
    for (var i = 0; i < sliceLen; i++) {
      newBuf[i] = this[i + start]
    }
  }

  if (newBuf.length) newBuf.parent = this.parent || this

  return newBuf
}

/*
 * Need to make sure that buffer isn't trying to write out of bounds.
 */
function checkOffset (offset, ext, length) {
  if ((offset % 1) !== 0 || offset < 0) throw new RangeError('offset is not uint')
  if (offset + ext > length) throw new RangeError('Trying to access beyond buffer length')
}

Buffer.prototype.readUIntLE = function readUIntLE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }

  return val
}

Buffer.prototype.readUIntBE = function readUIntBE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) {
    checkOffset(offset, byteLength, this.length)
  }

  var val = this[offset + --byteLength]
  var mul = 1
  while (byteLength > 0 && (mul *= 0x100)) {
    val += this[offset + --byteLength] * mul
  }

  return val
}

Buffer.prototype.readUInt8 = function readUInt8 (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 1, this.length)
  return this[offset]
}

Buffer.prototype.readUInt16LE = function readUInt16LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  return this[offset] | (this[offset + 1] << 8)
}

Buffer.prototype.readUInt16BE = function readUInt16BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  return (this[offset] << 8) | this[offset + 1]
}

Buffer.prototype.readUInt32LE = function readUInt32LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return ((this[offset]) |
      (this[offset + 1] << 8) |
      (this[offset + 2] << 16)) +
      (this[offset + 3] * 0x1000000)
}

Buffer.prototype.readUInt32BE = function readUInt32BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] * 0x1000000) +
    ((this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    this[offset + 3])
}

Buffer.prototype.readIntLE = function readIntLE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readIntBE = function readIntBE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var i = byteLength
  var mul = 1
  var val = this[offset + --i]
  while (i > 0 && (mul *= 0x100)) {
    val += this[offset + --i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readInt8 = function readInt8 (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 1, this.length)
  if (!(this[offset] & 0x80)) return (this[offset])
  return ((0xff - this[offset] + 1) * -1)
}

Buffer.prototype.readInt16LE = function readInt16LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset] | (this[offset + 1] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt16BE = function readInt16BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset + 1] | (this[offset] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt32LE = function readInt32LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset]) |
    (this[offset + 1] << 8) |
    (this[offset + 2] << 16) |
    (this[offset + 3] << 24)
}

Buffer.prototype.readInt32BE = function readInt32BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] << 24) |
    (this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    (this[offset + 3])
}

Buffer.prototype.readFloatLE = function readFloatLE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, true, 23, 4)
}

Buffer.prototype.readFloatBE = function readFloatBE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, false, 23, 4)
}

Buffer.prototype.readDoubleLE = function readDoubleLE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, true, 52, 8)
}

Buffer.prototype.readDoubleBE = function readDoubleBE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, false, 52, 8)
}

function checkInt (buf, value, offset, ext, max, min) {
  if (!Buffer.isBuffer(buf)) throw new TypeError('buffer must be a Buffer instance')
  if (value > max || value < min) throw new RangeError('value is out of bounds')
  if (offset + ext > buf.length) throw new RangeError('index out of range')
}

Buffer.prototype.writeUIntLE = function writeUIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) checkInt(this, value, offset, byteLength, Math.pow(2, 8 * byteLength), 0)

  var mul = 1
  var i = 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    this[offset + i] = (value / mul) >>> 0 & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUIntBE = function writeUIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) checkInt(this, value, offset, byteLength, Math.pow(2, 8 * byteLength), 0)

  var i = byteLength - 1
  var mul = 1
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    this[offset + i] = (value / mul) >>> 0 & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUInt8 = function writeUInt8 (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 1, 0xff, 0)
  if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value)
  this[offset] = value
  return offset + 1
}

function objectWriteUInt16 (buf, value, offset, littleEndian) {
  if (value < 0) value = 0xffff + value + 1
  for (var i = 0, j = Math.min(buf.length - offset, 2); i < j; i++) {
    buf[offset + i] = (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
      (littleEndian ? i : 1 - i) * 8
  }
}

Buffer.prototype.writeUInt16LE = function writeUInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = value
    this[offset + 1] = (value >>> 8)
  } else {
    objectWriteUInt16(this, value, offset, true)
  }
  return offset + 2
}

Buffer.prototype.writeUInt16BE = function writeUInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8)
    this[offset + 1] = value
  } else {
    objectWriteUInt16(this, value, offset, false)
  }
  return offset + 2
}

function objectWriteUInt32 (buf, value, offset, littleEndian) {
  if (value < 0) value = 0xffffffff + value + 1
  for (var i = 0, j = Math.min(buf.length - offset, 4); i < j; i++) {
    buf[offset + i] = (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff
  }
}

Buffer.prototype.writeUInt32LE = function writeUInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset + 3] = (value >>> 24)
    this[offset + 2] = (value >>> 16)
    this[offset + 1] = (value >>> 8)
    this[offset] = value
  } else {
    objectWriteUInt32(this, value, offset, true)
  }
  return offset + 4
}

Buffer.prototype.writeUInt32BE = function writeUInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24)
    this[offset + 1] = (value >>> 16)
    this[offset + 2] = (value >>> 8)
    this[offset + 3] = value
  } else {
    objectWriteUInt32(this, value, offset, false)
  }
  return offset + 4
}

Buffer.prototype.writeIntLE = function writeIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    checkInt(
      this, value, offset, byteLength,
      Math.pow(2, 8 * byteLength - 1) - 1,
      -Math.pow(2, 8 * byteLength - 1)
    )
  }

  var i = 0
  var mul = 1
  var sub = value < 0 ? 1 : 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeIntBE = function writeIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    checkInt(
      this, value, offset, byteLength,
      Math.pow(2, 8 * byteLength - 1) - 1,
      -Math.pow(2, 8 * byteLength - 1)
    )
  }

  var i = byteLength - 1
  var mul = 1
  var sub = value < 0 ? 1 : 0
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeInt8 = function writeInt8 (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 1, 0x7f, -0x80)
  if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value)
  if (value < 0) value = 0xff + value + 1
  this[offset] = value
  return offset + 1
}

Buffer.prototype.writeInt16LE = function writeInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = value
    this[offset + 1] = (value >>> 8)
  } else {
    objectWriteUInt16(this, value, offset, true)
  }
  return offset + 2
}

Buffer.prototype.writeInt16BE = function writeInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8)
    this[offset + 1] = value
  } else {
    objectWriteUInt16(this, value, offset, false)
  }
  return offset + 2
}

Buffer.prototype.writeInt32LE = function writeInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = value
    this[offset + 1] = (value >>> 8)
    this[offset + 2] = (value >>> 16)
    this[offset + 3] = (value >>> 24)
  } else {
    objectWriteUInt32(this, value, offset, true)
  }
  return offset + 4
}

Buffer.prototype.writeInt32BE = function writeInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (value < 0) value = 0xffffffff + value + 1
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24)
    this[offset + 1] = (value >>> 16)
    this[offset + 2] = (value >>> 8)
    this[offset + 3] = value
  } else {
    objectWriteUInt32(this, value, offset, false)
  }
  return offset + 4
}

function checkIEEE754 (buf, value, offset, ext, max, min) {
  if (value > max || value < min) throw new RangeError('value is out of bounds')
  if (offset + ext > buf.length) throw new RangeError('index out of range')
  if (offset < 0) throw new RangeError('index out of range')
}

function writeFloat (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 4, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }
  ieee754.write(buf, value, offset, littleEndian, 23, 4)
  return offset + 4
}

Buffer.prototype.writeFloatLE = function writeFloatLE (value, offset, noAssert) {
  return writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function writeFloatBE (value, offset, noAssert) {
  return writeFloat(this, value, offset, false, noAssert)
}

function writeDouble (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 8, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }
  ieee754.write(buf, value, offset, littleEndian, 52, 8)
  return offset + 8
}

Buffer.prototype.writeDoubleLE = function writeDoubleLE (value, offset, noAssert) {
  return writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function writeDoubleBE (value, offset, noAssert) {
  return writeDouble(this, value, offset, false, noAssert)
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function copy (target, target_start, start, end) {
  var self = this // source

  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (target_start >= target.length) target_start = target.length
  if (!target_start) target_start = 0
  if (end > 0 && end < start) end = start

  // Copy 0 bytes; we're done
  if (end === start) return 0
  if (target.length === 0 || self.length === 0) return 0

  // Fatal error conditions
  if (target_start < 0) {
    throw new RangeError('targetStart out of bounds')
  }
  if (start < 0 || start >= self.length) throw new RangeError('sourceStart out of bounds')
  if (end < 0) throw new RangeError('sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length) end = this.length
  if (target.length - target_start < end - start) {
    end = target.length - target_start + start
  }

  var len = end - start

  if (len < 1000 || !Buffer.TYPED_ARRAY_SUPPORT) {
    for (var i = 0; i < len; i++) {
      target[i + target_start] = this[i + start]
    }
  } else {
    target._set(this.subarray(start, start + len), target_start)
  }

  return len
}

// fill(value, start=0, end=buffer.length)
Buffer.prototype.fill = function fill (value, start, end) {
  if (!value) value = 0
  if (!start) start = 0
  if (!end) end = this.length

  if (end < start) throw new RangeError('end < start')

  // Fill 0 bytes; we're done
  if (end === start) return
  if (this.length === 0) return

  if (start < 0 || start >= this.length) throw new RangeError('start out of bounds')
  if (end < 0 || end > this.length) throw new RangeError('end out of bounds')

  var i
  if (typeof value === 'number') {
    for (i = start; i < end; i++) {
      this[i] = value
    }
  } else {
    var bytes = utf8ToBytes(value.toString())
    var len = bytes.length
    for (i = start; i < end; i++) {
      this[i] = bytes[i % len]
    }
  }

  return this
}

/**
 * Creates a new `ArrayBuffer` with the *copied* memory of the buffer instance.
 * Added in Node 0.12. Only available in browsers that support ArrayBuffer.
 */
Buffer.prototype.toArrayBuffer = function toArrayBuffer () {
  if (typeof Uint8Array !== 'undefined') {
    if (Buffer.TYPED_ARRAY_SUPPORT) {
      return (new Buffer(this)).buffer
    } else {
      var buf = new Uint8Array(this.length)
      for (var i = 0, len = buf.length; i < len; i += 1) {
        buf[i] = this[i]
      }
      return buf.buffer
    }
  } else {
    throw new TypeError('Buffer.toArrayBuffer not supported in this browser')
  }
}

// HELPER FUNCTIONS
// ================

var BP = Buffer.prototype

/**
 * Augment a Uint8Array *instance* (not the Uint8Array class!) with Buffer methods
 */
Buffer._augment = function _augment (arr) {
  arr.constructor = Buffer
  arr._isBuffer = true

  // save reference to original Uint8Array get/set methods before overwriting
  arr._get = arr.get
  arr._set = arr.set

  // deprecated, will be removed in node 0.13+
  arr.get = BP.get
  arr.set = BP.set

  arr.write = BP.write
  arr.toString = BP.toString
  arr.toLocaleString = BP.toString
  arr.toJSON = BP.toJSON
  arr.equals = BP.equals
  arr.compare = BP.compare
  arr.indexOf = BP.indexOf
  arr.copy = BP.copy
  arr.slice = BP.slice
  arr.readUIntLE = BP.readUIntLE
  arr.readUIntBE = BP.readUIntBE
  arr.readUInt8 = BP.readUInt8
  arr.readUInt16LE = BP.readUInt16LE
  arr.readUInt16BE = BP.readUInt16BE
  arr.readUInt32LE = BP.readUInt32LE
  arr.readUInt32BE = BP.readUInt32BE
  arr.readIntLE = BP.readIntLE
  arr.readIntBE = BP.readIntBE
  arr.readInt8 = BP.readInt8
  arr.readInt16LE = BP.readInt16LE
  arr.readInt16BE = BP.readInt16BE
  arr.readInt32LE = BP.readInt32LE
  arr.readInt32BE = BP.readInt32BE
  arr.readFloatLE = BP.readFloatLE
  arr.readFloatBE = BP.readFloatBE
  arr.readDoubleLE = BP.readDoubleLE
  arr.readDoubleBE = BP.readDoubleBE
  arr.writeUInt8 = BP.writeUInt8
  arr.writeUIntLE = BP.writeUIntLE
  arr.writeUIntBE = BP.writeUIntBE
  arr.writeUInt16LE = BP.writeUInt16LE
  arr.writeUInt16BE = BP.writeUInt16BE
  arr.writeUInt32LE = BP.writeUInt32LE
  arr.writeUInt32BE = BP.writeUInt32BE
  arr.writeIntLE = BP.writeIntLE
  arr.writeIntBE = BP.writeIntBE
  arr.writeInt8 = BP.writeInt8
  arr.writeInt16LE = BP.writeInt16LE
  arr.writeInt16BE = BP.writeInt16BE
  arr.writeInt32LE = BP.writeInt32LE
  arr.writeInt32BE = BP.writeInt32BE
  arr.writeFloatLE = BP.writeFloatLE
  arr.writeFloatBE = BP.writeFloatBE
  arr.writeDoubleLE = BP.writeDoubleLE
  arr.writeDoubleBE = BP.writeDoubleBE
  arr.fill = BP.fill
  arr.inspect = BP.inspect
  arr.toArrayBuffer = BP.toArrayBuffer

  return arr
}

var INVALID_BASE64_RE = /[^+\/0-9A-z\-]/g

function base64clean (str) {
  // Node strips out invalid characters like \n and \t from the string, base64-js does not
  str = stringtrim(str).replace(INVALID_BASE64_RE, '')
  // Node converts strings with length < 2 to ''
  if (str.length < 2) return ''
  // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
  while (str.length % 4 !== 0) {
    str = str + '='
  }
  return str
}

function stringtrim (str) {
  if (str.trim) return str.trim()
  return str.replace(/^\s+|\s+$/g, '')
}

function isArrayish (subject) {
  return isArray(subject) || Buffer.isBuffer(subject) ||
      subject && typeof subject === 'object' &&
      typeof subject.length === 'number'
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (string, units) {
  units = units || Infinity
  var codePoint
  var length = string.length
  var leadSurrogate = null
  var bytes = []
  var i = 0

  for (; i < length; i++) {
    codePoint = string.charCodeAt(i)

    // is surrogate component
    if (codePoint > 0xD7FF && codePoint < 0xE000) {
      // last char was a lead
      if (leadSurrogate) {
        // 2 leads in a row
        if (codePoint < 0xDC00) {
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          leadSurrogate = codePoint
          continue
        } else {
          // valid surrogate pair
          codePoint = leadSurrogate - 0xD800 << 10 | codePoint - 0xDC00 | 0x10000
          leadSurrogate = null
        }
      } else {
        // no lead yet

        if (codePoint > 0xDBFF) {
          // unexpected trail
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        } else if (i + 1 === length) {
          // unpaired lead
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        } else {
          // valid lead
          leadSurrogate = codePoint
          continue
        }
      }
    } else if (leadSurrogate) {
      // valid bmp char, but last char was a lead
      if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
      leadSurrogate = null
    }

    // encode utf8
    if (codePoint < 0x80) {
      if ((units -= 1) < 0) break
      bytes.push(codePoint)
    } else if (codePoint < 0x800) {
      if ((units -= 2) < 0) break
      bytes.push(
        codePoint >> 0x6 | 0xC0,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x10000) {
      if ((units -= 3) < 0) break
      bytes.push(
        codePoint >> 0xC | 0xE0,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x200000) {
      if ((units -= 4) < 0) break
      bytes.push(
        codePoint >> 0x12 | 0xF0,
        codePoint >> 0xC & 0x3F | 0x80,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else {
      throw new Error('Invalid code point')
    }
  }

  return bytes
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str, units) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    if ((units -= 2) < 0) break

    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(base64clean(str))
}

function blitBuffer (src, dst, offset, length) {
  for (var i = 0; i < length; i++) {
    if ((i + offset >= dst.length) || (i >= src.length)) break
    dst[i + offset] = src[i]
  }
  return i
}

function decodeUtf8Char (str) {
  try {
    return decodeURIComponent(str)
  } catch (err) {
    return String.fromCharCode(0xFFFD) // UTF 8 invalid char
  }
}

},{"base64-js":73,"ieee754":74,"is-array":75}],73:[function(require,module,exports){
var lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

;(function (exports) {
	'use strict';

  var Arr = (typeof Uint8Array !== 'undefined')
    ? Uint8Array
    : Array

	var PLUS   = '+'.charCodeAt(0)
	var SLASH  = '/'.charCodeAt(0)
	var NUMBER = '0'.charCodeAt(0)
	var LOWER  = 'a'.charCodeAt(0)
	var UPPER  = 'A'.charCodeAt(0)
	var PLUS_URL_SAFE = '-'.charCodeAt(0)
	var SLASH_URL_SAFE = '_'.charCodeAt(0)

	function decode (elt) {
		var code = elt.charCodeAt(0)
		if (code === PLUS ||
		    code === PLUS_URL_SAFE)
			return 62 // '+'
		if (code === SLASH ||
		    code === SLASH_URL_SAFE)
			return 63 // '/'
		if (code < NUMBER)
			return -1 //no match
		if (code < NUMBER + 10)
			return code - NUMBER + 26 + 26
		if (code < UPPER + 26)
			return code - UPPER
		if (code < LOWER + 26)
			return code - LOWER + 26
	}

	function b64ToByteArray (b64) {
		var i, j, l, tmp, placeHolders, arr

		if (b64.length % 4 > 0) {
			throw new Error('Invalid string. Length must be a multiple of 4')
		}

		// the number of equal signs (place holders)
		// if there are two placeholders, than the two characters before it
		// represent one byte
		// if there is only one, then the three characters before it represent 2 bytes
		// this is just a cheap hack to not do indexOf twice
		var len = b64.length
		placeHolders = '=' === b64.charAt(len - 2) ? 2 : '=' === b64.charAt(len - 1) ? 1 : 0

		// base64 is 4/3 + up to two characters of the original data
		arr = new Arr(b64.length * 3 / 4 - placeHolders)

		// if there are placeholders, only get up to the last complete 4 chars
		l = placeHolders > 0 ? b64.length - 4 : b64.length

		var L = 0

		function push (v) {
			arr[L++] = v
		}

		for (i = 0, j = 0; i < l; i += 4, j += 3) {
			tmp = (decode(b64.charAt(i)) << 18) | (decode(b64.charAt(i + 1)) << 12) | (decode(b64.charAt(i + 2)) << 6) | decode(b64.charAt(i + 3))
			push((tmp & 0xFF0000) >> 16)
			push((tmp & 0xFF00) >> 8)
			push(tmp & 0xFF)
		}

		if (placeHolders === 2) {
			tmp = (decode(b64.charAt(i)) << 2) | (decode(b64.charAt(i + 1)) >> 4)
			push(tmp & 0xFF)
		} else if (placeHolders === 1) {
			tmp = (decode(b64.charAt(i)) << 10) | (decode(b64.charAt(i + 1)) << 4) | (decode(b64.charAt(i + 2)) >> 2)
			push((tmp >> 8) & 0xFF)
			push(tmp & 0xFF)
		}

		return arr
	}

	function uint8ToBase64 (uint8) {
		var i,
			extraBytes = uint8.length % 3, // if we have 1 byte left, pad 2 bytes
			output = "",
			temp, length

		function encode (num) {
			return lookup.charAt(num)
		}

		function tripletToBase64 (num) {
			return encode(num >> 18 & 0x3F) + encode(num >> 12 & 0x3F) + encode(num >> 6 & 0x3F) + encode(num & 0x3F)
		}

		// go through the array every three bytes, we'll deal with trailing stuff later
		for (i = 0, length = uint8.length - extraBytes; i < length; i += 3) {
			temp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2])
			output += tripletToBase64(temp)
		}

		// pad the end with zeros, but make sure to not forget the extra bytes
		switch (extraBytes) {
			case 1:
				temp = uint8[uint8.length - 1]
				output += encode(temp >> 2)
				output += encode((temp << 4) & 0x3F)
				output += '=='
				break
			case 2:
				temp = (uint8[uint8.length - 2] << 8) + (uint8[uint8.length - 1])
				output += encode(temp >> 10)
				output += encode((temp >> 4) & 0x3F)
				output += encode((temp << 2) & 0x3F)
				output += '='
				break
		}

		return output
	}

	exports.toByteArray = b64ToByteArray
	exports.fromByteArray = uint8ToBase64
}(typeof exports === 'undefined' ? (this.base64js = {}) : exports))

},{}],74:[function(require,module,exports){
exports.read = function(buffer, offset, isLE, mLen, nBytes) {
  var e, m,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      nBits = -7,
      i = isLE ? (nBytes - 1) : 0,
      d = isLE ? -1 : 1,
      s = buffer[offset + i];

  i += d;

  e = s & ((1 << (-nBits)) - 1);
  s >>= (-nBits);
  nBits += eLen;
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8);

  m = e & ((1 << (-nBits)) - 1);
  e >>= (-nBits);
  nBits += mLen;
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8);

  if (e === 0) {
    e = 1 - eBias;
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity);
  } else {
    m = m + Math.pow(2, mLen);
    e = e - eBias;
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen);
};

exports.write = function(buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0),
      i = isLE ? 0 : (nBytes - 1),
      d = isLE ? 1 : -1,
      s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0;

  value = Math.abs(value);

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0;
    e = eMax;
  } else {
    e = Math.floor(Math.log(value) / Math.LN2);
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--;
      c *= 2;
    }
    if (e + eBias >= 1) {
      value += rt / c;
    } else {
      value += rt * Math.pow(2, 1 - eBias);
    }
    if (value * c >= 2) {
      e++;
      c /= 2;
    }

    if (e + eBias >= eMax) {
      m = 0;
      e = eMax;
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen);
      e = e + eBias;
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
      e = 0;
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8);

  e = (e << mLen) | m;
  eLen += mLen;
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8);

  buffer[offset + i - d] |= s * 128;
};

},{}],75:[function(require,module,exports){

/**
 * isArray
 */

var isArray = Array.isArray;

/**
 * toString
 */

var str = Object.prototype.toString;

/**
 * Whether or not the given `val`
 * is an array.
 *
 * example:
 *
 *        isArray([]);
 *        // > true
 *        isArray(arguments);
 *        // > false
 *        isArray('');
 *        // > false
 *
 * @param {mixed} val
 * @return {bool}
 */

module.exports = isArray || function (val) {
  return !! val && '[object Array]' == str.call(val);
};

},{}],76:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

function EventEmitter() {
  this._events = this._events || {};
  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
EventEmitter.defaultMaxListeners = 10;

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!isNumber(n) || n < 0 || isNaN(n))
    throw TypeError('n must be a positive number');
  this._maxListeners = n;
  return this;
};

EventEmitter.prototype.emit = function(type) {
  var er, handler, len, args, i, listeners;

  if (!this._events)
    this._events = {};

  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events.error ||
        (isObject(this._events.error) && !this._events.error.length)) {
      er = arguments[1];
      if (er instanceof Error) {
        throw er; // Unhandled 'error' event
      }
      throw TypeError('Uncaught, unspecified "error" event.');
    }
  }

  handler = this._events[type];

  if (isUndefined(handler))
    return false;

  if (isFunction(handler)) {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        len = arguments.length;
        args = new Array(len - 1);
        for (i = 1; i < len; i++)
          args[i - 1] = arguments[i];
        handler.apply(this, args);
    }
  } else if (isObject(handler)) {
    len = arguments.length;
    args = new Array(len - 1);
    for (i = 1; i < len; i++)
      args[i - 1] = arguments[i];

    listeners = handler.slice();
    len = listeners.length;
    for (i = 0; i < len; i++)
      listeners[i].apply(this, args);
  }

  return true;
};

EventEmitter.prototype.addListener = function(type, listener) {
  var m;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events)
    this._events = {};

  // To avoid recursion in the case that type === "newListener"! Before
  // adding it to the listeners, first emit "newListener".
  if (this._events.newListener)
    this.emit('newListener', type,
              isFunction(listener.listener) ?
              listener.listener : listener);

  if (!this._events[type])
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  else if (isObject(this._events[type]))
    // If we've already got an array, just append.
    this._events[type].push(listener);
  else
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];

  // Check for listener leak
  if (isObject(this._events[type]) && !this._events[type].warned) {
    var m;
    if (!isUndefined(this._maxListeners)) {
      m = this._maxListeners;
    } else {
      m = EventEmitter.defaultMaxListeners;
    }

    if (m && m > 0 && this._events[type].length > m) {
      this._events[type].warned = true;
      console.error('(node) warning: possible EventEmitter memory ' +
                    'leak detected. %d listeners added. ' +
                    'Use emitter.setMaxListeners() to increase limit.',
                    this._events[type].length);
      if (typeof console.trace === 'function') {
        // not supported in IE 10
        console.trace();
      }
    }
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  var fired = false;

  function g() {
    this.removeListener(type, g);

    if (!fired) {
      fired = true;
      listener.apply(this, arguments);
    }
  }

  g.listener = listener;
  this.on(type, g);

  return this;
};

// emits a 'removeListener' event iff the listener was removed
EventEmitter.prototype.removeListener = function(type, listener) {
  var list, position, length, i;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events || !this._events[type])
    return this;

  list = this._events[type];
  length = list.length;
  position = -1;

  if (list === listener ||
      (isFunction(list.listener) && list.listener === listener)) {
    delete this._events[type];
    if (this._events.removeListener)
      this.emit('removeListener', type, listener);

  } else if (isObject(list)) {
    for (i = length; i-- > 0;) {
      if (list[i] === listener ||
          (list[i].listener && list[i].listener === listener)) {
        position = i;
        break;
      }
    }

    if (position < 0)
      return this;

    if (list.length === 1) {
      list.length = 0;
      delete this._events[type];
    } else {
      list.splice(position, 1);
    }

    if (this._events.removeListener)
      this.emit('removeListener', type, listener);
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  var key, listeners;

  if (!this._events)
    return this;

  // not listening for removeListener, no need to emit
  if (!this._events.removeListener) {
    if (arguments.length === 0)
      this._events = {};
    else if (this._events[type])
      delete this._events[type];
    return this;
  }

  // emit removeListener for all listeners on all events
  if (arguments.length === 0) {
    for (key in this._events) {
      if (key === 'removeListener') continue;
      this.removeAllListeners(key);
    }
    this.removeAllListeners('removeListener');
    this._events = {};
    return this;
  }

  listeners = this._events[type];

  if (isFunction(listeners)) {
    this.removeListener(type, listeners);
  } else {
    // LIFO order
    while (listeners.length)
      this.removeListener(type, listeners[listeners.length - 1]);
  }
  delete this._events[type];

  return this;
};

EventEmitter.prototype.listeners = function(type) {
  var ret;
  if (!this._events || !this._events[type])
    ret = [];
  else if (isFunction(this._events[type]))
    ret = [this._events[type]];
  else
    ret = this._events[type].slice();
  return ret;
};

EventEmitter.listenerCount = function(emitter, type) {
  var ret;
  if (!emitter._events || !emitter._events[type])
    ret = 0;
  else if (isFunction(emitter._events[type]))
    ret = 1;
  else
    ret = emitter._events[type].length;
  return ret;
};

function isFunction(arg) {
  return typeof arg === 'function';
}

function isNumber(arg) {
  return typeof arg === 'number';
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isUndefined(arg) {
  return arg === void 0;
}

},{}],77:[function(require,module,exports){
arguments[4][29][0].apply(exports,arguments)
},{"dup":29}],78:[function(require,module,exports){
module.exports = Array.isArray || function (arr) {
  return Object.prototype.toString.call(arr) == '[object Array]';
};

},{}],79:[function(require,module,exports){
(function (process){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// resolves . and .. elements in a path array with directory names there
// must be no slashes, empty elements, or device names (c:\) in the array
// (so also no leading and trailing slashes - it does not distinguish
// relative and absolute paths)
function normalizeArray(parts, allowAboveRoot) {
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = parts.length - 1; i >= 0; i--) {
    var last = parts[i];
    if (last === '.') {
      parts.splice(i, 1);
    } else if (last === '..') {
      parts.splice(i, 1);
      up++;
    } else if (up) {
      parts.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (allowAboveRoot) {
    for (; up--; up) {
      parts.unshift('..');
    }
  }

  return parts;
}

// Split a filename into [root, dir, basename, ext], unix version
// 'root' is just a slash, or nothing.
var splitPathRe =
    /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
var splitPath = function(filename) {
  return splitPathRe.exec(filename).slice(1);
};

// path.resolve([from ...], to)
// posix version
exports.resolve = function() {
  var resolvedPath = '',
      resolvedAbsolute = false;

  for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
    var path = (i >= 0) ? arguments[i] : process.cwd();

    // Skip empty and invalid entries
    if (typeof path !== 'string') {
      throw new TypeError('Arguments to path.resolve must be strings');
    } else if (!path) {
      continue;
    }

    resolvedPath = path + '/' + resolvedPath;
    resolvedAbsolute = path.charAt(0) === '/';
  }

  // At this point the path should be resolved to a full absolute path, but
  // handle relative paths to be safe (might happen when process.cwd() fails)

  // Normalize the path
  resolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {
    return !!p;
  }), !resolvedAbsolute).join('/');

  return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
};

// path.normalize(path)
// posix version
exports.normalize = function(path) {
  var isAbsolute = exports.isAbsolute(path),
      trailingSlash = substr(path, -1) === '/';

  // Normalize the path
  path = normalizeArray(filter(path.split('/'), function(p) {
    return !!p;
  }), !isAbsolute).join('/');

  if (!path && !isAbsolute) {
    path = '.';
  }
  if (path && trailingSlash) {
    path += '/';
  }

  return (isAbsolute ? '/' : '') + path;
};

// posix version
exports.isAbsolute = function(path) {
  return path.charAt(0) === '/';
};

// posix version
exports.join = function() {
  var paths = Array.prototype.slice.call(arguments, 0);
  return exports.normalize(filter(paths, function(p, index) {
    if (typeof p !== 'string') {
      throw new TypeError('Arguments to path.join must be strings');
    }
    return p;
  }).join('/'));
};


// path.relative(from, to)
// posix version
exports.relative = function(from, to) {
  from = exports.resolve(from).substr(1);
  to = exports.resolve(to).substr(1);

  function trim(arr) {
    var start = 0;
    for (; start < arr.length; start++) {
      if (arr[start] !== '') break;
    }

    var end = arr.length - 1;
    for (; end >= 0; end--) {
      if (arr[end] !== '') break;
    }

    if (start > end) return [];
    return arr.slice(start, end - start + 1);
  }

  var fromParts = trim(from.split('/'));
  var toParts = trim(to.split('/'));

  var length = Math.min(fromParts.length, toParts.length);
  var samePartsLength = length;
  for (var i = 0; i < length; i++) {
    if (fromParts[i] !== toParts[i]) {
      samePartsLength = i;
      break;
    }
  }

  var outputParts = [];
  for (var i = samePartsLength; i < fromParts.length; i++) {
    outputParts.push('..');
  }

  outputParts = outputParts.concat(toParts.slice(samePartsLength));

  return outputParts.join('/');
};

exports.sep = '/';
exports.delimiter = ':';

exports.dirname = function(path) {
  var result = splitPath(path),
      root = result[0],
      dir = result[1];

  if (!root && !dir) {
    // No dirname whatsoever
    return '.';
  }

  if (dir) {
    // It has a dirname, strip trailing slash
    dir = dir.substr(0, dir.length - 1);
  }

  return root + dir;
};


exports.basename = function(path, ext) {
  var f = splitPath(path)[2];
  // TODO: make this comparison case-insensitive on windows?
  if (ext && f.substr(-1 * ext.length) === ext) {
    f = f.substr(0, f.length - ext.length);
  }
  return f;
};


exports.extname = function(path) {
  return splitPath(path)[3];
};

function filter (xs, f) {
    if (xs.filter) return xs.filter(f);
    var res = [];
    for (var i = 0; i < xs.length; i++) {
        if (f(xs[i], i, xs)) res.push(xs[i]);
    }
    return res;
}

// String.prototype.substr - negative index don't work in IE8
var substr = 'ab'.substr(-1) === 'b'
    ? function (str, start, len) { return str.substr(start, len) }
    : function (str, start, len) {
        if (start < 0) start = str.length + start;
        return str.substr(start, len);
    }
;

}).call(this,require('_process'))

},{"_process":80}],80:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};
var queue = [];
var draining = false;

function drainQueue() {
    if (draining) {
        return;
    }
    draining = true;
    var currentQueue;
    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        var i = -1;
        while (++i < len) {
            currentQueue[i]();
        }
        len = queue.length;
    }
    draining = false;
}
process.nextTick = function (fun) {
    queue.push(fun);
    if (!draining) {
        setTimeout(drainQueue, 0);
    }
};

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],81:[function(require,module,exports){
module.exports = require("./lib/_stream_duplex.js")

},{"./lib/_stream_duplex.js":82}],82:[function(require,module,exports){
(function (process){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// a duplex stream is just a stream that is both readable and writable.
// Since JS doesn't have multiple prototypal inheritance, this class
// prototypally inherits from Readable, and then parasitically from
// Writable.

module.exports = Duplex;

/*<replacement>*/
var objectKeys = Object.keys || function (obj) {
  var keys = [];
  for (var key in obj) keys.push(key);
  return keys;
}
/*</replacement>*/


/*<replacement>*/
var util = require('core-util-is');
util.inherits = require('inherits');
/*</replacement>*/

var Readable = require('./_stream_readable');
var Writable = require('./_stream_writable');

util.inherits(Duplex, Readable);

forEach(objectKeys(Writable.prototype), function(method) {
  if (!Duplex.prototype[method])
    Duplex.prototype[method] = Writable.prototype[method];
});

function Duplex(options) {
  if (!(this instanceof Duplex))
    return new Duplex(options);

  Readable.call(this, options);
  Writable.call(this, options);

  if (options && options.readable === false)
    this.readable = false;

  if (options && options.writable === false)
    this.writable = false;

  this.allowHalfOpen = true;
  if (options && options.allowHalfOpen === false)
    this.allowHalfOpen = false;

  this.once('end', onend);
}

// the no-half-open enforcer
function onend() {
  // if we allow half-open state, or if the writable side ended,
  // then we're ok.
  if (this.allowHalfOpen || this._writableState.ended)
    return;

  // no more data can be written.
  // But allow more writes to happen in this tick.
  process.nextTick(this.end.bind(this));
}

function forEach (xs, f) {
  for (var i = 0, l = xs.length; i < l; i++) {
    f(xs[i], i);
  }
}

}).call(this,require('_process'))

},{"./_stream_readable":84,"./_stream_writable":86,"_process":80,"core-util-is":87,"inherits":77}],83:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// a passthrough stream.
// basically just the most minimal sort of Transform stream.
// Every written chunk gets output as-is.

module.exports = PassThrough;

var Transform = require('./_stream_transform');

/*<replacement>*/
var util = require('core-util-is');
util.inherits = require('inherits');
/*</replacement>*/

util.inherits(PassThrough, Transform);

function PassThrough(options) {
  if (!(this instanceof PassThrough))
    return new PassThrough(options);

  Transform.call(this, options);
}

PassThrough.prototype._transform = function(chunk, encoding, cb) {
  cb(null, chunk);
};

},{"./_stream_transform":85,"core-util-is":87,"inherits":77}],84:[function(require,module,exports){
(function (process){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

module.exports = Readable;

/*<replacement>*/
var isArray = require('isarray');
/*</replacement>*/


/*<replacement>*/
var Buffer = require('buffer').Buffer;
/*</replacement>*/

Readable.ReadableState = ReadableState;

var EE = require('events').EventEmitter;

/*<replacement>*/
if (!EE.listenerCount) EE.listenerCount = function(emitter, type) {
  return emitter.listeners(type).length;
};
/*</replacement>*/

var Stream = require('stream');

/*<replacement>*/
var util = require('core-util-is');
util.inherits = require('inherits');
/*</replacement>*/

var StringDecoder;


/*<replacement>*/
var debug = require('util');
if (debug && debug.debuglog) {
  debug = debug.debuglog('stream');
} else {
  debug = function () {};
}
/*</replacement>*/


util.inherits(Readable, Stream);

function ReadableState(options, stream) {
  var Duplex = require('./_stream_duplex');

  options = options || {};

  // the point at which it stops calling _read() to fill the buffer
  // Note: 0 is a valid value, means "don't call _read preemptively ever"
  var hwm = options.highWaterMark;
  var defaultHwm = options.objectMode ? 16 : 16 * 1024;
  this.highWaterMark = (hwm || hwm === 0) ? hwm : defaultHwm;

  // cast to ints.
  this.highWaterMark = ~~this.highWaterMark;

  this.buffer = [];
  this.length = 0;
  this.pipes = null;
  this.pipesCount = 0;
  this.flowing = null;
  this.ended = false;
  this.endEmitted = false;
  this.reading = false;

  // a flag to be able to tell if the onwrite cb is called immediately,
  // or on a later tick.  We set this to true at first, because any
  // actions that shouldn't happen until "later" should generally also
  // not happen before the first write call.
  this.sync = true;

  // whenever we return null, then we set a flag to say
  // that we're awaiting a 'readable' event emission.
  this.needReadable = false;
  this.emittedReadable = false;
  this.readableListening = false;


  // object stream flag. Used to make read(n) ignore n and to
  // make all the buffer merging and length checks go away
  this.objectMode = !!options.objectMode;

  if (stream instanceof Duplex)
    this.objectMode = this.objectMode || !!options.readableObjectMode;

  // Crypto is kind of old and crusty.  Historically, its default string
  // encoding is 'binary' so we have to make this configurable.
  // Everything else in the universe uses 'utf8', though.
  this.defaultEncoding = options.defaultEncoding || 'utf8';

  // when piping, we only care about 'readable' events that happen
  // after read()ing all the bytes and not getting any pushback.
  this.ranOut = false;

  // the number of writers that are awaiting a drain event in .pipe()s
  this.awaitDrain = 0;

  // if true, a maybeReadMore has been scheduled
  this.readingMore = false;

  this.decoder = null;
  this.encoding = null;
  if (options.encoding) {
    if (!StringDecoder)
      StringDecoder = require('string_decoder/').StringDecoder;
    this.decoder = new StringDecoder(options.encoding);
    this.encoding = options.encoding;
  }
}

function Readable(options) {
  var Duplex = require('./_stream_duplex');

  if (!(this instanceof Readable))
    return new Readable(options);

  this._readableState = new ReadableState(options, this);

  // legacy
  this.readable = true;

  Stream.call(this);
}

// Manually shove something into the read() buffer.
// This returns true if the highWaterMark has not been hit yet,
// similar to how Writable.write() returns true if you should
// write() some more.
Readable.prototype.push = function(chunk, encoding) {
  var state = this._readableState;

  if (util.isString(chunk) && !state.objectMode) {
    encoding = encoding || state.defaultEncoding;
    if (encoding !== state.encoding) {
      chunk = new Buffer(chunk, encoding);
      encoding = '';
    }
  }

  return readableAddChunk(this, state, chunk, encoding, false);
};

// Unshift should *always* be something directly out of read()
Readable.prototype.unshift = function(chunk) {
  var state = this._readableState;
  return readableAddChunk(this, state, chunk, '', true);
};

function readableAddChunk(stream, state, chunk, encoding, addToFront) {
  var er = chunkInvalid(state, chunk);
  if (er) {
    stream.emit('error', er);
  } else if (util.isNullOrUndefined(chunk)) {
    state.reading = false;
    if (!state.ended)
      onEofChunk(stream, state);
  } else if (state.objectMode || chunk && chunk.length > 0) {
    if (state.ended && !addToFront) {
      var e = new Error('stream.push() after EOF');
      stream.emit('error', e);
    } else if (state.endEmitted && addToFront) {
      var e = new Error('stream.unshift() after end event');
      stream.emit('error', e);
    } else {
      if (state.decoder && !addToFront && !encoding)
        chunk = state.decoder.write(chunk);

      if (!addToFront)
        state.reading = false;

      // if we want the data now, just emit it.
      if (state.flowing && state.length === 0 && !state.sync) {
        stream.emit('data', chunk);
        stream.read(0);
      } else {
        // update the buffer info.
        state.length += state.objectMode ? 1 : chunk.length;
        if (addToFront)
          state.buffer.unshift(chunk);
        else
          state.buffer.push(chunk);

        if (state.needReadable)
          emitReadable(stream);
      }

      maybeReadMore(stream, state);
    }
  } else if (!addToFront) {
    state.reading = false;
  }

  return needMoreData(state);
}



// if it's past the high water mark, we can push in some more.
// Also, if we have no data yet, we can stand some
// more bytes.  This is to work around cases where hwm=0,
// such as the repl.  Also, if the push() triggered a
// readable event, and the user called read(largeNumber) such that
// needReadable was set, then we ought to push more, so that another
// 'readable' event will be triggered.
function needMoreData(state) {
  return !state.ended &&
         (state.needReadable ||
          state.length < state.highWaterMark ||
          state.length === 0);
}

// backwards compatibility.
Readable.prototype.setEncoding = function(enc) {
  if (!StringDecoder)
    StringDecoder = require('string_decoder/').StringDecoder;
  this._readableState.decoder = new StringDecoder(enc);
  this._readableState.encoding = enc;
  return this;
};

// Don't raise the hwm > 128MB
var MAX_HWM = 0x800000;
function roundUpToNextPowerOf2(n) {
  if (n >= MAX_HWM) {
    n = MAX_HWM;
  } else {
    // Get the next highest power of 2
    n--;
    for (var p = 1; p < 32; p <<= 1) n |= n >> p;
    n++;
  }
  return n;
}

function howMuchToRead(n, state) {
  if (state.length === 0 && state.ended)
    return 0;

  if (state.objectMode)
    return n === 0 ? 0 : 1;

  if (isNaN(n) || util.isNull(n)) {
    // only flow one buffer at a time
    if (state.flowing && state.buffer.length)
      return state.buffer[0].length;
    else
      return state.length;
  }

  if (n <= 0)
    return 0;

  // If we're asking for more than the target buffer level,
  // then raise the water mark.  Bump up to the next highest
  // power of 2, to prevent increasing it excessively in tiny
  // amounts.
  if (n > state.highWaterMark)
    state.highWaterMark = roundUpToNextPowerOf2(n);

  // don't have that much.  return null, unless we've ended.
  if (n > state.length) {
    if (!state.ended) {
      state.needReadable = true;
      return 0;
    } else
      return state.length;
  }

  return n;
}

// you can override either this method, or the async _read(n) below.
Readable.prototype.read = function(n) {
  debug('read', n);
  var state = this._readableState;
  var nOrig = n;

  if (!util.isNumber(n) || n > 0)
    state.emittedReadable = false;

  // if we're doing read(0) to trigger a readable event, but we
  // already have a bunch of data in the buffer, then just trigger
  // the 'readable' event and move on.
  if (n === 0 &&
      state.needReadable &&
      (state.length >= state.highWaterMark || state.ended)) {
    debug('read: emitReadable', state.length, state.ended);
    if (state.length === 0 && state.ended)
      endReadable(this);
    else
      emitReadable(this);
    return null;
  }

  n = howMuchToRead(n, state);

  // if we've ended, and we're now clear, then finish it up.
  if (n === 0 && state.ended) {
    if (state.length === 0)
      endReadable(this);
    return null;
  }

  // All the actual chunk generation logic needs to be
  // *below* the call to _read.  The reason is that in certain
  // synthetic stream cases, such as passthrough streams, _read
  // may be a completely synchronous operation which may change
  // the state of the read buffer, providing enough data when
  // before there was *not* enough.
  //
  // So, the steps are:
  // 1. Figure out what the state of things will be after we do
  // a read from the buffer.
  //
  // 2. If that resulting state will trigger a _read, then call _read.
  // Note that this may be asynchronous, or synchronous.  Yes, it is
  // deeply ugly to write APIs this way, but that still doesn't mean
  // that the Readable class should behave improperly, as streams are
  // designed to be sync/async agnostic.
  // Take note if the _read call is sync or async (ie, if the read call
  // has returned yet), so that we know whether or not it's safe to emit
  // 'readable' etc.
  //
  // 3. Actually pull the requested chunks out of the buffer and return.

  // if we need a readable event, then we need to do some reading.
  var doRead = state.needReadable;
  debug('need readable', doRead);

  // if we currently have less than the highWaterMark, then also read some
  if (state.length === 0 || state.length - n < state.highWaterMark) {
    doRead = true;
    debug('length less than watermark', doRead);
  }

  // however, if we've ended, then there's no point, and if we're already
  // reading, then it's unnecessary.
  if (state.ended || state.reading) {
    doRead = false;
    debug('reading or ended', doRead);
  }

  if (doRead) {
    debug('do read');
    state.reading = true;
    state.sync = true;
    // if the length is currently zero, then we *need* a readable event.
    if (state.length === 0)
      state.needReadable = true;
    // call internal read method
    this._read(state.highWaterMark);
    state.sync = false;
  }

  // If _read pushed data synchronously, then `reading` will be false,
  // and we need to re-evaluate how much data we can return to the user.
  if (doRead && !state.reading)
    n = howMuchToRead(nOrig, state);

  var ret;
  if (n > 0)
    ret = fromList(n, state);
  else
    ret = null;

  if (util.isNull(ret)) {
    state.needReadable = true;
    n = 0;
  }

  state.length -= n;

  // If we have nothing in the buffer, then we want to know
  // as soon as we *do* get something into the buffer.
  if (state.length === 0 && !state.ended)
    state.needReadable = true;

  // If we tried to read() past the EOF, then emit end on the next tick.
  if (nOrig !== n && state.ended && state.length === 0)
    endReadable(this);

  if (!util.isNull(ret))
    this.emit('data', ret);

  return ret;
};

function chunkInvalid(state, chunk) {
  var er = null;
  if (!util.isBuffer(chunk) &&
      !util.isString(chunk) &&
      !util.isNullOrUndefined(chunk) &&
      !state.objectMode) {
    er = new TypeError('Invalid non-string/buffer chunk');
  }
  return er;
}


function onEofChunk(stream, state) {
  if (state.decoder && !state.ended) {
    var chunk = state.decoder.end();
    if (chunk && chunk.length) {
      state.buffer.push(chunk);
      state.length += state.objectMode ? 1 : chunk.length;
    }
  }
  state.ended = true;

  // emit 'readable' now to make sure it gets picked up.
  emitReadable(stream);
}

// Don't emit readable right away in sync mode, because this can trigger
// another read() call => stack overflow.  This way, it might trigger
// a nextTick recursion warning, but that's not so bad.
function emitReadable(stream) {
  var state = stream._readableState;
  state.needReadable = false;
  if (!state.emittedReadable) {
    debug('emitReadable', state.flowing);
    state.emittedReadable = true;
    if (state.sync)
      process.nextTick(function() {
        emitReadable_(stream);
      });
    else
      emitReadable_(stream);
  }
}

function emitReadable_(stream) {
  debug('emit readable');
  stream.emit('readable');
  flow(stream);
}


// at this point, the user has presumably seen the 'readable' event,
// and called read() to consume some data.  that may have triggered
// in turn another _read(n) call, in which case reading = true if
// it's in progress.
// However, if we're not ended, or reading, and the length < hwm,
// then go ahead and try to read some more preemptively.
function maybeReadMore(stream, state) {
  if (!state.readingMore) {
    state.readingMore = true;
    process.nextTick(function() {
      maybeReadMore_(stream, state);
    });
  }
}

function maybeReadMore_(stream, state) {
  var len = state.length;
  while (!state.reading && !state.flowing && !state.ended &&
         state.length < state.highWaterMark) {
    debug('maybeReadMore read 0');
    stream.read(0);
    if (len === state.length)
      // didn't get any data, stop spinning.
      break;
    else
      len = state.length;
  }
  state.readingMore = false;
}

// abstract method.  to be overridden in specific implementation classes.
// call cb(er, data) where data is <= n in length.
// for virtual (non-string, non-buffer) streams, "length" is somewhat
// arbitrary, and perhaps not very meaningful.
Readable.prototype._read = function(n) {
  this.emit('error', new Error('not implemented'));
};

Readable.prototype.pipe = function(dest, pipeOpts) {
  var src = this;
  var state = this._readableState;

  switch (state.pipesCount) {
    case 0:
      state.pipes = dest;
      break;
    case 1:
      state.pipes = [state.pipes, dest];
      break;
    default:
      state.pipes.push(dest);
      break;
  }
  state.pipesCount += 1;
  debug('pipe count=%d opts=%j', state.pipesCount, pipeOpts);

  var doEnd = (!pipeOpts || pipeOpts.end !== false) &&
              dest !== process.stdout &&
              dest !== process.stderr;

  var endFn = doEnd ? onend : cleanup;
  if (state.endEmitted)
    process.nextTick(endFn);
  else
    src.once('end', endFn);

  dest.on('unpipe', onunpipe);
  function onunpipe(readable) {
    debug('onunpipe');
    if (readable === src) {
      cleanup();
    }
  }

  function onend() {
    debug('onend');
    dest.end();
  }

  // when the dest drains, it reduces the awaitDrain counter
  // on the source.  This would be more elegant with a .once()
  // handler in flow(), but adding and removing repeatedly is
  // too slow.
  var ondrain = pipeOnDrain(src);
  dest.on('drain', ondrain);

  function cleanup() {
    debug('cleanup');
    // cleanup event handlers once the pipe is broken
    dest.removeListener('close', onclose);
    dest.removeListener('finish', onfinish);
    dest.removeListener('drain', ondrain);
    dest.removeListener('error', onerror);
    dest.removeListener('unpipe', onunpipe);
    src.removeListener('end', onend);
    src.removeListener('end', cleanup);
    src.removeListener('data', ondata);

    // if the reader is waiting for a drain event from this
    // specific writer, then it would cause it to never start
    // flowing again.
    // So, if this is awaiting a drain, then we just call it now.
    // If we don't know, then assume that we are waiting for one.
    if (state.awaitDrain &&
        (!dest._writableState || dest._writableState.needDrain))
      ondrain();
  }

  src.on('data', ondata);
  function ondata(chunk) {
    debug('ondata');
    var ret = dest.write(chunk);
    if (false === ret) {
      debug('false write response, pause',
            src._readableState.awaitDrain);
      src._readableState.awaitDrain++;
      src.pause();
    }
  }

  // if the dest has an error, then stop piping into it.
  // however, don't suppress the throwing behavior for this.
  function onerror(er) {
    debug('onerror', er);
    unpipe();
    dest.removeListener('error', onerror);
    if (EE.listenerCount(dest, 'error') === 0)
      dest.emit('error', er);
  }
  // This is a brutally ugly hack to make sure that our error handler
  // is attached before any userland ones.  NEVER DO THIS.
  if (!dest._events || !dest._events.error)
    dest.on('error', onerror);
  else if (isArray(dest._events.error))
    dest._events.error.unshift(onerror);
  else
    dest._events.error = [onerror, dest._events.error];



  // Both close and finish should trigger unpipe, but only once.
  function onclose() {
    dest.removeListener('finish', onfinish);
    unpipe();
  }
  dest.once('close', onclose);
  function onfinish() {
    debug('onfinish');
    dest.removeListener('close', onclose);
    unpipe();
  }
  dest.once('finish', onfinish);

  function unpipe() {
    debug('unpipe');
    src.unpipe(dest);
  }

  // tell the dest that it's being piped to
  dest.emit('pipe', src);

  // start the flow if it hasn't been started already.
  if (!state.flowing) {
    debug('pipe resume');
    src.resume();
  }

  return dest;
};

function pipeOnDrain(src) {
  return function() {
    var state = src._readableState;
    debug('pipeOnDrain', state.awaitDrain);
    if (state.awaitDrain)
      state.awaitDrain--;
    if (state.awaitDrain === 0 && EE.listenerCount(src, 'data')) {
      state.flowing = true;
      flow(src);
    }
  };
}


Readable.prototype.unpipe = function(dest) {
  var state = this._readableState;

  // if we're not piping anywhere, then do nothing.
  if (state.pipesCount === 0)
    return this;

  // just one destination.  most common case.
  if (state.pipesCount === 1) {
    // passed in one, but it's not the right one.
    if (dest && dest !== state.pipes)
      return this;

    if (!dest)
      dest = state.pipes;

    // got a match.
    state.pipes = null;
    state.pipesCount = 0;
    state.flowing = false;
    if (dest)
      dest.emit('unpipe', this);
    return this;
  }

  // slow case. multiple pipe destinations.

  if (!dest) {
    // remove all.
    var dests = state.pipes;
    var len = state.pipesCount;
    state.pipes = null;
    state.pipesCount = 0;
    state.flowing = false;

    for (var i = 0; i < len; i++)
      dests[i].emit('unpipe', this);
    return this;
  }

  // try to find the right one.
  var i = indexOf(state.pipes, dest);
  if (i === -1)
    return this;

  state.pipes.splice(i, 1);
  state.pipesCount -= 1;
  if (state.pipesCount === 1)
    state.pipes = state.pipes[0];

  dest.emit('unpipe', this);

  return this;
};

// set up data events if they are asked for
// Ensure readable listeners eventually get something
Readable.prototype.on = function(ev, fn) {
  var res = Stream.prototype.on.call(this, ev, fn);

  // If listening to data, and it has not explicitly been paused,
  // then call resume to start the flow of data on the next tick.
  if (ev === 'data' && false !== this._readableState.flowing) {
    this.resume();
  }

  if (ev === 'readable' && this.readable) {
    var state = this._readableState;
    if (!state.readableListening) {
      state.readableListening = true;
      state.emittedReadable = false;
      state.needReadable = true;
      if (!state.reading) {
        var self = this;
        process.nextTick(function() {
          debug('readable nexttick read 0');
          self.read(0);
        });
      } else if (state.length) {
        emitReadable(this, state);
      }
    }
  }

  return res;
};
Readable.prototype.addListener = Readable.prototype.on;

// pause() and resume() are remnants of the legacy readable stream API
// If the user uses them, then switch into old mode.
Readable.prototype.resume = function() {
  var state = this._readableState;
  if (!state.flowing) {
    debug('resume');
    state.flowing = true;
    if (!state.reading) {
      debug('resume read 0');
      this.read(0);
    }
    resume(this, state);
  }
  return this;
};

function resume(stream, state) {
  if (!state.resumeScheduled) {
    state.resumeScheduled = true;
    process.nextTick(function() {
      resume_(stream, state);
    });
  }
}

function resume_(stream, state) {
  state.resumeScheduled = false;
  stream.emit('resume');
  flow(stream);
  if (state.flowing && !state.reading)
    stream.read(0);
}

Readable.prototype.pause = function() {
  debug('call pause flowing=%j', this._readableState.flowing);
  if (false !== this._readableState.flowing) {
    debug('pause');
    this._readableState.flowing = false;
    this.emit('pause');
  }
  return this;
};

function flow(stream) {
  var state = stream._readableState;
  debug('flow', state.flowing);
  if (state.flowing) {
    do {
      var chunk = stream.read();
    } while (null !== chunk && state.flowing);
  }
}

// wrap an old-style stream as the async data source.
// This is *not* part of the readable stream interface.
// It is an ugly unfortunate mess of history.
Readable.prototype.wrap = function(stream) {
  var state = this._readableState;
  var paused = false;

  var self = this;
  stream.on('end', function() {
    debug('wrapped end');
    if (state.decoder && !state.ended) {
      var chunk = state.decoder.end();
      if (chunk && chunk.length)
        self.push(chunk);
    }

    self.push(null);
  });

  stream.on('data', function(chunk) {
    debug('wrapped data');
    if (state.decoder)
      chunk = state.decoder.write(chunk);
    if (!chunk || !state.objectMode && !chunk.length)
      return;

    var ret = self.push(chunk);
    if (!ret) {
      paused = true;
      stream.pause();
    }
  });

  // proxy all the other methods.
  // important when wrapping filters and duplexes.
  for (var i in stream) {
    if (util.isFunction(stream[i]) && util.isUndefined(this[i])) {
      this[i] = function(method) { return function() {
        return stream[method].apply(stream, arguments);
      }}(i);
    }
  }

  // proxy certain important events.
  var events = ['error', 'close', 'destroy', 'pause', 'resume'];
  forEach(events, function(ev) {
    stream.on(ev, self.emit.bind(self, ev));
  });

  // when we try to consume some more bytes, simply unpause the
  // underlying stream.
  self._read = function(n) {
    debug('wrapped _read', n);
    if (paused) {
      paused = false;
      stream.resume();
    }
  };

  return self;
};



// exposed for testing purposes only.
Readable._fromList = fromList;

// Pluck off n bytes from an array of buffers.
// Length is the combined lengths of all the buffers in the list.
function fromList(n, state) {
  var list = state.buffer;
  var length = state.length;
  var stringMode = !!state.decoder;
  var objectMode = !!state.objectMode;
  var ret;

  // nothing in the list, definitely empty.
  if (list.length === 0)
    return null;

  if (length === 0)
    ret = null;
  else if (objectMode)
    ret = list.shift();
  else if (!n || n >= length) {
    // read it all, truncate the array.
    if (stringMode)
      ret = list.join('');
    else
      ret = Buffer.concat(list, length);
    list.length = 0;
  } else {
    // read just some of it.
    if (n < list[0].length) {
      // just take a part of the first list item.
      // slice is the same for buffers and strings.
      var buf = list[0];
      ret = buf.slice(0, n);
      list[0] = buf.slice(n);
    } else if (n === list[0].length) {
      // first list is a perfect match
      ret = list.shift();
    } else {
      // complex case.
      // we have enough to cover it, but it spans past the first buffer.
      if (stringMode)
        ret = '';
      else
        ret = new Buffer(n);

      var c = 0;
      for (var i = 0, l = list.length; i < l && c < n; i++) {
        var buf = list[0];
        var cpy = Math.min(n - c, buf.length);

        if (stringMode)
          ret += buf.slice(0, cpy);
        else
          buf.copy(ret, c, 0, cpy);

        if (cpy < buf.length)
          list[0] = buf.slice(cpy);
        else
          list.shift();

        c += cpy;
      }
    }
  }

  return ret;
}

function endReadable(stream) {
  var state = stream._readableState;

  // If we get here before consuming all the bytes, then that is a
  // bug in node.  Should never happen.
  if (state.length > 0)
    throw new Error('endReadable called on non-empty stream');

  if (!state.endEmitted) {
    state.ended = true;
    process.nextTick(function() {
      // Check that we didn't get one last unshift.
      if (!state.endEmitted && state.length === 0) {
        state.endEmitted = true;
        stream.readable = false;
        stream.emit('end');
      }
    });
  }
}

function forEach (xs, f) {
  for (var i = 0, l = xs.length; i < l; i++) {
    f(xs[i], i);
  }
}

function indexOf (xs, x) {
  for (var i = 0, l = xs.length; i < l; i++) {
    if (xs[i] === x) return i;
  }
  return -1;
}

}).call(this,require('_process'))

},{"./_stream_duplex":82,"_process":80,"buffer":72,"core-util-is":87,"events":76,"inherits":77,"isarray":78,"stream":92,"string_decoder/":93,"util":71}],85:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.


// a transform stream is a readable/writable stream where you do
// something with the data.  Sometimes it's called a "filter",
// but that's not a great name for it, since that implies a thing where
// some bits pass through, and others are simply ignored.  (That would
// be a valid example of a transform, of course.)
//
// While the output is causally related to the input, it's not a
// necessarily symmetric or synchronous transformation.  For example,
// a zlib stream might take multiple plain-text writes(), and then
// emit a single compressed chunk some time in the future.
//
// Here's how this works:
//
// The Transform stream has all the aspects of the readable and writable
// stream classes.  When you write(chunk), that calls _write(chunk,cb)
// internally, and returns false if there's a lot of pending writes
// buffered up.  When you call read(), that calls _read(n) until
// there's enough pending readable data buffered up.
//
// In a transform stream, the written data is placed in a buffer.  When
// _read(n) is called, it transforms the queued up data, calling the
// buffered _write cb's as it consumes chunks.  If consuming a single
// written chunk would result in multiple output chunks, then the first
// outputted bit calls the readcb, and subsequent chunks just go into
// the read buffer, and will cause it to emit 'readable' if necessary.
//
// This way, back-pressure is actually determined by the reading side,
// since _read has to be called to start processing a new chunk.  However,
// a pathological inflate type of transform can cause excessive buffering
// here.  For example, imagine a stream where every byte of input is
// interpreted as an integer from 0-255, and then results in that many
// bytes of output.  Writing the 4 bytes {ff,ff,ff,ff} would result in
// 1kb of data being output.  In this case, you could write a very small
// amount of input, and end up with a very large amount of output.  In
// such a pathological inflating mechanism, there'd be no way to tell
// the system to stop doing the transform.  A single 4MB write could
// cause the system to run out of memory.
//
// However, even in such a pathological case, only a single written chunk
// would be consumed, and then the rest would wait (un-transformed) until
// the results of the previous transformed chunk were consumed.

module.exports = Transform;

var Duplex = require('./_stream_duplex');

/*<replacement>*/
var util = require('core-util-is');
util.inherits = require('inherits');
/*</replacement>*/

util.inherits(Transform, Duplex);


function TransformState(options, stream) {
  this.afterTransform = function(er, data) {
    return afterTransform(stream, er, data);
  };

  this.needTransform = false;
  this.transforming = false;
  this.writecb = null;
  this.writechunk = null;
}

function afterTransform(stream, er, data) {
  var ts = stream._transformState;
  ts.transforming = false;

  var cb = ts.writecb;

  if (!cb)
    return stream.emit('error', new Error('no writecb in Transform class'));

  ts.writechunk = null;
  ts.writecb = null;

  if (!util.isNullOrUndefined(data))
    stream.push(data);

  if (cb)
    cb(er);

  var rs = stream._readableState;
  rs.reading = false;
  if (rs.needReadable || rs.length < rs.highWaterMark) {
    stream._read(rs.highWaterMark);
  }
}


function Transform(options) {
  if (!(this instanceof Transform))
    return new Transform(options);

  Duplex.call(this, options);

  this._transformState = new TransformState(options, this);

  // when the writable side finishes, then flush out anything remaining.
  var stream = this;

  // start out asking for a readable event once data is transformed.
  this._readableState.needReadable = true;

  // we have implemented the _read method, and done the other things
  // that Readable wants before the first _read call, so unset the
  // sync guard flag.
  this._readableState.sync = false;

  this.once('prefinish', function() {
    if (util.isFunction(this._flush))
      this._flush(function(er) {
        done(stream, er);
      });
    else
      done(stream);
  });
}

Transform.prototype.push = function(chunk, encoding) {
  this._transformState.needTransform = false;
  return Duplex.prototype.push.call(this, chunk, encoding);
};

// This is the part where you do stuff!
// override this function in implementation classes.
// 'chunk' is an input chunk.
//
// Call `push(newChunk)` to pass along transformed output
// to the readable side.  You may call 'push' zero or more times.
//
// Call `cb(err)` when you are done with this chunk.  If you pass
// an error, then that'll put the hurt on the whole operation.  If you
// never call cb(), then you'll never get another chunk.
Transform.prototype._transform = function(chunk, encoding, cb) {
  throw new Error('not implemented');
};

Transform.prototype._write = function(chunk, encoding, cb) {
  var ts = this._transformState;
  ts.writecb = cb;
  ts.writechunk = chunk;
  ts.writeencoding = encoding;
  if (!ts.transforming) {
    var rs = this._readableState;
    if (ts.needTransform ||
        rs.needReadable ||
        rs.length < rs.highWaterMark)
      this._read(rs.highWaterMark);
  }
};

// Doesn't matter what the args are here.
// _transform does all the work.
// That we got here means that the readable side wants more data.
Transform.prototype._read = function(n) {
  var ts = this._transformState;

  if (!util.isNull(ts.writechunk) && ts.writecb && !ts.transforming) {
    ts.transforming = true;
    this._transform(ts.writechunk, ts.writeencoding, ts.afterTransform);
  } else {
    // mark that we need a transform, so that any data that comes in
    // will get processed, now that we've asked for it.
    ts.needTransform = true;
  }
};


function done(stream, er) {
  if (er)
    return stream.emit('error', er);

  // if there's nothing in the write buffer, then that means
  // that nothing more will ever be provided
  var ws = stream._writableState;
  var ts = stream._transformState;

  if (ws.length)
    throw new Error('calling transform done when ws.length != 0');

  if (ts.transforming)
    throw new Error('calling transform done when still transforming');

  return stream.push(null);
}

},{"./_stream_duplex":82,"core-util-is":87,"inherits":77}],86:[function(require,module,exports){
(function (process){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// A bit simpler than readable streams.
// Implement an async ._write(chunk, cb), and it'll handle all
// the drain event emission and buffering.

module.exports = Writable;

/*<replacement>*/
var Buffer = require('buffer').Buffer;
/*</replacement>*/

Writable.WritableState = WritableState;


/*<replacement>*/
var util = require('core-util-is');
util.inherits = require('inherits');
/*</replacement>*/

var Stream = require('stream');

util.inherits(Writable, Stream);

function WriteReq(chunk, encoding, cb) {
  this.chunk = chunk;
  this.encoding = encoding;
  this.callback = cb;
}

function WritableState(options, stream) {
  var Duplex = require('./_stream_duplex');

  options = options || {};

  // the point at which write() starts returning false
  // Note: 0 is a valid value, means that we always return false if
  // the entire buffer is not flushed immediately on write()
  var hwm = options.highWaterMark;
  var defaultHwm = options.objectMode ? 16 : 16 * 1024;
  this.highWaterMark = (hwm || hwm === 0) ? hwm : defaultHwm;

  // object stream flag to indicate whether or not this stream
  // contains buffers or objects.
  this.objectMode = !!options.objectMode;

  if (stream instanceof Duplex)
    this.objectMode = this.objectMode || !!options.writableObjectMode;

  // cast to ints.
  this.highWaterMark = ~~this.highWaterMark;

  this.needDrain = false;
  // at the start of calling end()
  this.ending = false;
  // when end() has been called, and returned
  this.ended = false;
  // when 'finish' is emitted
  this.finished = false;

  // should we decode strings into buffers before passing to _write?
  // this is here so that some node-core streams can optimize string
  // handling at a lower level.
  var noDecode = options.decodeStrings === false;
  this.decodeStrings = !noDecode;

  // Crypto is kind of old and crusty.  Historically, its default string
  // encoding is 'binary' so we have to make this configurable.
  // Everything else in the universe uses 'utf8', though.
  this.defaultEncoding = options.defaultEncoding || 'utf8';

  // not an actual buffer we keep track of, but a measurement
  // of how much we're waiting to get pushed to some underlying
  // socket or file.
  this.length = 0;

  // a flag to see when we're in the middle of a write.
  this.writing = false;

  // when true all writes will be buffered until .uncork() call
  this.corked = 0;

  // a flag to be able to tell if the onwrite cb is called immediately,
  // or on a later tick.  We set this to true at first, because any
  // actions that shouldn't happen until "later" should generally also
  // not happen before the first write call.
  this.sync = true;

  // a flag to know if we're processing previously buffered items, which
  // may call the _write() callback in the same tick, so that we don't
  // end up in an overlapped onwrite situation.
  this.bufferProcessing = false;

  // the callback that's passed to _write(chunk,cb)
  this.onwrite = function(er) {
    onwrite(stream, er);
  };

  // the callback that the user supplies to write(chunk,encoding,cb)
  this.writecb = null;

  // the amount that is being written when _write is called.
  this.writelen = 0;

  this.buffer = [];

  // number of pending user-supplied write callbacks
  // this must be 0 before 'finish' can be emitted
  this.pendingcb = 0;

  // emit prefinish if the only thing we're waiting for is _write cbs
  // This is relevant for synchronous Transform streams
  this.prefinished = false;

  // True if the error was already emitted and should not be thrown again
  this.errorEmitted = false;
}

function Writable(options) {
  var Duplex = require('./_stream_duplex');

  // Writable ctor is applied to Duplexes, though they're not
  // instanceof Writable, they're instanceof Readable.
  if (!(this instanceof Writable) && !(this instanceof Duplex))
    return new Writable(options);

  this._writableState = new WritableState(options, this);

  // legacy.
  this.writable = true;

  Stream.call(this);
}

// Otherwise people can pipe Writable streams, which is just wrong.
Writable.prototype.pipe = function() {
  this.emit('error', new Error('Cannot pipe. Not readable.'));
};


function writeAfterEnd(stream, state, cb) {
  var er = new Error('write after end');
  // TODO: defer error events consistently everywhere, not just the cb
  stream.emit('error', er);
  process.nextTick(function() {
    cb(er);
  });
}

// If we get something that is not a buffer, string, null, or undefined,
// and we're not in objectMode, then that's an error.
// Otherwise stream chunks are all considered to be of length=1, and the
// watermarks determine how many objects to keep in the buffer, rather than
// how many bytes or characters.
function validChunk(stream, state, chunk, cb) {
  var valid = true;
  if (!util.isBuffer(chunk) &&
      !util.isString(chunk) &&
      !util.isNullOrUndefined(chunk) &&
      !state.objectMode) {
    var er = new TypeError('Invalid non-string/buffer chunk');
    stream.emit('error', er);
    process.nextTick(function() {
      cb(er);
    });
    valid = false;
  }
  return valid;
}

Writable.prototype.write = function(chunk, encoding, cb) {
  var state = this._writableState;
  var ret = false;

  if (util.isFunction(encoding)) {
    cb = encoding;
    encoding = null;
  }

  if (util.isBuffer(chunk))
    encoding = 'buffer';
  else if (!encoding)
    encoding = state.defaultEncoding;

  if (!util.isFunction(cb))
    cb = function() {};

  if (state.ended)
    writeAfterEnd(this, state, cb);
  else if (validChunk(this, state, chunk, cb)) {
    state.pendingcb++;
    ret = writeOrBuffer(this, state, chunk, encoding, cb);
  }

  return ret;
};

Writable.prototype.cork = function() {
  var state = this._writableState;

  state.corked++;
};

Writable.prototype.uncork = function() {
  var state = this._writableState;

  if (state.corked) {
    state.corked--;

    if (!state.writing &&
        !state.corked &&
        !state.finished &&
        !state.bufferProcessing &&
        state.buffer.length)
      clearBuffer(this, state);
  }
};

function decodeChunk(state, chunk, encoding) {
  if (!state.objectMode &&
      state.decodeStrings !== false &&
      util.isString(chunk)) {
    chunk = new Buffer(chunk, encoding);
  }
  return chunk;
}

// if we're already writing something, then just put this
// in the queue, and wait our turn.  Otherwise, call _write
// If we return false, then we need a drain event, so set that flag.
function writeOrBuffer(stream, state, chunk, encoding, cb) {
  chunk = decodeChunk(state, chunk, encoding);
  if (util.isBuffer(chunk))
    encoding = 'buffer';
  var len = state.objectMode ? 1 : chunk.length;

  state.length += len;

  var ret = state.length < state.highWaterMark;
  // we must ensure that previous needDrain will not be reset to false.
  if (!ret)
    state.needDrain = true;

  if (state.writing || state.corked)
    state.buffer.push(new WriteReq(chunk, encoding, cb));
  else
    doWrite(stream, state, false, len, chunk, encoding, cb);

  return ret;
}

function doWrite(stream, state, writev, len, chunk, encoding, cb) {
  state.writelen = len;
  state.writecb = cb;
  state.writing = true;
  state.sync = true;
  if (writev)
    stream._writev(chunk, state.onwrite);
  else
    stream._write(chunk, encoding, state.onwrite);
  state.sync = false;
}

function onwriteError(stream, state, sync, er, cb) {
  if (sync)
    process.nextTick(function() {
      state.pendingcb--;
      cb(er);
    });
  else {
    state.pendingcb--;
    cb(er);
  }

  stream._writableState.errorEmitted = true;
  stream.emit('error', er);
}

function onwriteStateUpdate(state) {
  state.writing = false;
  state.writecb = null;
  state.length -= state.writelen;
  state.writelen = 0;
}

function onwrite(stream, er) {
  var state = stream._writableState;
  var sync = state.sync;
  var cb = state.writecb;

  onwriteStateUpdate(state);

  if (er)
    onwriteError(stream, state, sync, er, cb);
  else {
    // Check if we're actually ready to finish, but don't emit yet
    var finished = needFinish(stream, state);

    if (!finished &&
        !state.corked &&
        !state.bufferProcessing &&
        state.buffer.length) {
      clearBuffer(stream, state);
    }

    if (sync) {
      process.nextTick(function() {
        afterWrite(stream, state, finished, cb);
      });
    } else {
      afterWrite(stream, state, finished, cb);
    }
  }
}

function afterWrite(stream, state, finished, cb) {
  if (!finished)
    onwriteDrain(stream, state);
  state.pendingcb--;
  cb();
  finishMaybe(stream, state);
}

// Must force callback to be called on nextTick, so that we don't
// emit 'drain' before the write() consumer gets the 'false' return
// value, and has a chance to attach a 'drain' listener.
function onwriteDrain(stream, state) {
  if (state.length === 0 && state.needDrain) {
    state.needDrain = false;
    stream.emit('drain');
  }
}


// if there's something in the buffer waiting, then process it
function clearBuffer(stream, state) {
  state.bufferProcessing = true;

  if (stream._writev && state.buffer.length > 1) {
    // Fast case, write everything using _writev()
    var cbs = [];
    for (var c = 0; c < state.buffer.length; c++)
      cbs.push(state.buffer[c].callback);

    // count the one we are adding, as well.
    // TODO(isaacs) clean this up
    state.pendingcb++;
    doWrite(stream, state, true, state.length, state.buffer, '', function(err) {
      for (var i = 0; i < cbs.length; i++) {
        state.pendingcb--;
        cbs[i](err);
      }
    });

    // Clear buffer
    state.buffer = [];
  } else {
    // Slow case, write chunks one-by-one
    for (var c = 0; c < state.buffer.length; c++) {
      var entry = state.buffer[c];
      var chunk = entry.chunk;
      var encoding = entry.encoding;
      var cb = entry.callback;
      var len = state.objectMode ? 1 : chunk.length;

      doWrite(stream, state, false, len, chunk, encoding, cb);

      // if we didn't call the onwrite immediately, then
      // it means that we need to wait until it does.
      // also, that means that the chunk and cb are currently
      // being processed, so move the buffer counter past them.
      if (state.writing) {
        c++;
        break;
      }
    }

    if (c < state.buffer.length)
      state.buffer = state.buffer.slice(c);
    else
      state.buffer.length = 0;
  }

  state.bufferProcessing = false;
}

Writable.prototype._write = function(chunk, encoding, cb) {
  cb(new Error('not implemented'));

};

Writable.prototype._writev = null;

Writable.prototype.end = function(chunk, encoding, cb) {
  var state = this._writableState;

  if (util.isFunction(chunk)) {
    cb = chunk;
    chunk = null;
    encoding = null;
  } else if (util.isFunction(encoding)) {
    cb = encoding;
    encoding = null;
  }

  if (!util.isNullOrUndefined(chunk))
    this.write(chunk, encoding);

  // .end() fully uncorks
  if (state.corked) {
    state.corked = 1;
    this.uncork();
  }

  // ignore unnecessary end() calls.
  if (!state.ending && !state.finished)
    endWritable(this, state, cb);
};


function needFinish(stream, state) {
  return (state.ending &&
          state.length === 0 &&
          !state.finished &&
          !state.writing);
}

function prefinish(stream, state) {
  if (!state.prefinished) {
    state.prefinished = true;
    stream.emit('prefinish');
  }
}

function finishMaybe(stream, state) {
  var need = needFinish(stream, state);
  if (need) {
    if (state.pendingcb === 0) {
      prefinish(stream, state);
      state.finished = true;
      stream.emit('finish');
    } else
      prefinish(stream, state);
  }
  return need;
}

function endWritable(stream, state, cb) {
  state.ending = true;
  finishMaybe(stream, state);
  if (cb) {
    if (state.finished)
      process.nextTick(cb);
    else
      stream.once('finish', cb);
  }
  state.ended = true;
}

}).call(this,require('_process'))

},{"./_stream_duplex":82,"_process":80,"buffer":72,"core-util-is":87,"inherits":77,"stream":92}],87:[function(require,module,exports){
(function (Buffer){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
function isArray(ar) {
  return Array.isArray(ar);
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return isObject(re) && objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return isObject(e) &&
      (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

function isBuffer(arg) {
  return Buffer.isBuffer(arg);
}
exports.isBuffer = isBuffer;

function objectToString(o) {
  return Object.prototype.toString.call(o);
}
}).call(this,require("buffer").Buffer)

},{"buffer":72}],88:[function(require,module,exports){
module.exports = require("./lib/_stream_passthrough.js")

},{"./lib/_stream_passthrough.js":83}],89:[function(require,module,exports){
exports = module.exports = require('./lib/_stream_readable.js');
exports.Stream = require('stream');
exports.Readable = exports;
exports.Writable = require('./lib/_stream_writable.js');
exports.Duplex = require('./lib/_stream_duplex.js');
exports.Transform = require('./lib/_stream_transform.js');
exports.PassThrough = require('./lib/_stream_passthrough.js');

},{"./lib/_stream_duplex.js":82,"./lib/_stream_passthrough.js":83,"./lib/_stream_readable.js":84,"./lib/_stream_transform.js":85,"./lib/_stream_writable.js":86,"stream":92}],90:[function(require,module,exports){
module.exports = require("./lib/_stream_transform.js")

},{"./lib/_stream_transform.js":85}],91:[function(require,module,exports){
module.exports = require("./lib/_stream_writable.js")

},{"./lib/_stream_writable.js":86}],92:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

module.exports = Stream;

var EE = require('events').EventEmitter;
var inherits = require('inherits');

inherits(Stream, EE);
Stream.Readable = require('readable-stream/readable.js');
Stream.Writable = require('readable-stream/writable.js');
Stream.Duplex = require('readable-stream/duplex.js');
Stream.Transform = require('readable-stream/transform.js');
Stream.PassThrough = require('readable-stream/passthrough.js');

// Backwards-compat with node 0.4.x
Stream.Stream = Stream;



// old-style streams.  Note that the pipe method (the only relevant
// part of this class) is overridden in the Readable class.

function Stream() {
  EE.call(this);
}

Stream.prototype.pipe = function(dest, options) {
  var source = this;

  function ondata(chunk) {
    if (dest.writable) {
      if (false === dest.write(chunk) && source.pause) {
        source.pause();
      }
    }
  }

  source.on('data', ondata);

  function ondrain() {
    if (source.readable && source.resume) {
      source.resume();
    }
  }

  dest.on('drain', ondrain);

  // If the 'end' option is not supplied, dest.end() will be called when
  // source gets the 'end' or 'close' events.  Only dest.end() once.
  if (!dest._isStdio && (!options || options.end !== false)) {
    source.on('end', onend);
    source.on('close', onclose);
  }

  var didOnEnd = false;
  function onend() {
    if (didOnEnd) return;
    didOnEnd = true;

    dest.end();
  }


  function onclose() {
    if (didOnEnd) return;
    didOnEnd = true;

    if (typeof dest.destroy === 'function') dest.destroy();
  }

  // don't leave dangling pipes when there are errors.
  function onerror(er) {
    cleanup();
    if (EE.listenerCount(this, 'error') === 0) {
      throw er; // Unhandled stream error in pipe.
    }
  }

  source.on('error', onerror);
  dest.on('error', onerror);

  // remove all the event listeners that were added.
  function cleanup() {
    source.removeListener('data', ondata);
    dest.removeListener('drain', ondrain);

    source.removeListener('end', onend);
    source.removeListener('close', onclose);

    source.removeListener('error', onerror);
    dest.removeListener('error', onerror);

    source.removeListener('end', cleanup);
    source.removeListener('close', cleanup);

    dest.removeListener('close', cleanup);
  }

  source.on('end', cleanup);
  source.on('close', cleanup);

  dest.on('close', cleanup);

  dest.emit('pipe', source);

  // Allow for unix-like usage: A.pipe(B).pipe(C)
  return dest;
};

},{"events":76,"inherits":77,"readable-stream/duplex.js":81,"readable-stream/passthrough.js":88,"readable-stream/readable.js":89,"readable-stream/transform.js":90,"readable-stream/writable.js":91}],93:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var Buffer = require('buffer').Buffer;

var isBufferEncoding = Buffer.isEncoding
  || function(encoding) {
       switch (encoding && encoding.toLowerCase()) {
         case 'hex': case 'utf8': case 'utf-8': case 'ascii': case 'binary': case 'base64': case 'ucs2': case 'ucs-2': case 'utf16le': case 'utf-16le': case 'raw': return true;
         default: return false;
       }
     }


function assertEncoding(encoding) {
  if (encoding && !isBufferEncoding(encoding)) {
    throw new Error('Unknown encoding: ' + encoding);
  }
}

// StringDecoder provides an interface for efficiently splitting a series of
// buffers into a series of JS strings without breaking apart multi-byte
// characters. CESU-8 is handled as part of the UTF-8 encoding.
//
// @TODO Handling all encodings inside a single object makes it very difficult
// to reason about this code, so it should be split up in the future.
// @TODO There should be a utf8-strict encoding that rejects invalid UTF-8 code
// points as used by CESU-8.
var StringDecoder = exports.StringDecoder = function(encoding) {
  this.encoding = (encoding || 'utf8').toLowerCase().replace(/[-_]/, '');
  assertEncoding(encoding);
  switch (this.encoding) {
    case 'utf8':
      // CESU-8 represents each of Surrogate Pair by 3-bytes
      this.surrogateSize = 3;
      break;
    case 'ucs2':
    case 'utf16le':
      // UTF-16 represents each of Surrogate Pair by 2-bytes
      this.surrogateSize = 2;
      this.detectIncompleteChar = utf16DetectIncompleteChar;
      break;
    case 'base64':
      // Base-64 stores 3 bytes in 4 chars, and pads the remainder.
      this.surrogateSize = 3;
      this.detectIncompleteChar = base64DetectIncompleteChar;
      break;
    default:
      this.write = passThroughWrite;
      return;
  }

  // Enough space to store all bytes of a single character. UTF-8 needs 4
  // bytes, but CESU-8 may require up to 6 (3 bytes per surrogate).
  this.charBuffer = new Buffer(6);
  // Number of bytes received for the current incomplete multi-byte character.
  this.charReceived = 0;
  // Number of bytes expected for the current incomplete multi-byte character.
  this.charLength = 0;
};


// write decodes the given buffer and returns it as JS string that is
// guaranteed to not contain any partial multi-byte characters. Any partial
// character found at the end of the buffer is buffered up, and will be
// returned when calling write again with the remaining bytes.
//
// Note: Converting a Buffer containing an orphan surrogate to a String
// currently works, but converting a String to a Buffer (via `new Buffer`, or
// Buffer#write) will replace incomplete surrogates with the unicode
// replacement character. See https://codereview.chromium.org/121173009/ .
StringDecoder.prototype.write = function(buffer) {
  var charStr = '';
  // if our last write ended with an incomplete multibyte character
  while (this.charLength) {
    // determine how many remaining bytes this buffer has to offer for this char
    var available = (buffer.length >= this.charLength - this.charReceived) ?
        this.charLength - this.charReceived :
        buffer.length;

    // add the new bytes to the char buffer
    buffer.copy(this.charBuffer, this.charReceived, 0, available);
    this.charReceived += available;

    if (this.charReceived < this.charLength) {
      // still not enough chars in this buffer? wait for more ...
      return '';
    }

    // remove bytes belonging to the current character from the buffer
    buffer = buffer.slice(available, buffer.length);

    // get the character that was split
    charStr = this.charBuffer.slice(0, this.charLength).toString(this.encoding);

    // CESU-8: lead surrogate (D800-DBFF) is also the incomplete character
    var charCode = charStr.charCodeAt(charStr.length - 1);
    if (charCode >= 0xD800 && charCode <= 0xDBFF) {
      this.charLength += this.surrogateSize;
      charStr = '';
      continue;
    }
    this.charReceived = this.charLength = 0;

    // if there are no more bytes in this buffer, just emit our char
    if (buffer.length === 0) {
      return charStr;
    }
    break;
  }

  // determine and set charLength / charReceived
  this.detectIncompleteChar(buffer);

  var end = buffer.length;
  if (this.charLength) {
    // buffer the incomplete character bytes we got
    buffer.copy(this.charBuffer, 0, buffer.length - this.charReceived, end);
    end -= this.charReceived;
  }

  charStr += buffer.toString(this.encoding, 0, end);

  var end = charStr.length - 1;
  var charCode = charStr.charCodeAt(end);
  // CESU-8: lead surrogate (D800-DBFF) is also the incomplete character
  if (charCode >= 0xD800 && charCode <= 0xDBFF) {
    var size = this.surrogateSize;
    this.charLength += size;
    this.charReceived += size;
    this.charBuffer.copy(this.charBuffer, size, 0, size);
    buffer.copy(this.charBuffer, 0, 0, size);
    return charStr.substring(0, end);
  }

  // or just emit the charStr
  return charStr;
};

// detectIncompleteChar determines if there is an incomplete UTF-8 character at
// the end of the given buffer. If so, it sets this.charLength to the byte
// length that character, and sets this.charReceived to the number of bytes
// that are available for this character.
StringDecoder.prototype.detectIncompleteChar = function(buffer) {
  // determine how many bytes we have to check at the end of this buffer
  var i = (buffer.length >= 3) ? 3 : buffer.length;

  // Figure out if one of the last i bytes of our buffer announces an
  // incomplete char.
  for (; i > 0; i--) {
    var c = buffer[buffer.length - i];

    // See http://en.wikipedia.org/wiki/UTF-8#Description

    // 110XXXXX
    if (i == 1 && c >> 5 == 0x06) {
      this.charLength = 2;
      break;
    }

    // 1110XXXX
    if (i <= 2 && c >> 4 == 0x0E) {
      this.charLength = 3;
      break;
    }

    // 11110XXX
    if (i <= 3 && c >> 3 == 0x1E) {
      this.charLength = 4;
      break;
    }
  }
  this.charReceived = i;
};

StringDecoder.prototype.end = function(buffer) {
  var res = '';
  if (buffer && buffer.length)
    res = this.write(buffer);

  if (this.charReceived) {
    var cr = this.charReceived;
    var buf = this.charBuffer;
    var enc = this.encoding;
    res += buf.slice(0, cr).toString(enc);
  }

  return res;
};

function passThroughWrite(buffer) {
  return buffer.toString(this.encoding);
}

function utf16DetectIncompleteChar(buffer) {
  this.charReceived = buffer.length % 2;
  this.charLength = this.charReceived ? 2 : 0;
}

function base64DetectIncompleteChar(buffer) {
  this.charReceived = buffer.length % 3;
  this.charLength = this.charReceived ? 3 : 0;
}

},{"buffer":72}],94:[function(require,module,exports){
module.exports = function isBuffer(arg) {
  return arg && typeof arg === 'object'
    && typeof arg.copy === 'function'
    && typeof arg.fill === 'function'
    && typeof arg.readUInt8 === 'function';
}
},{}],95:[function(require,module,exports){
(function (process,global){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (!isString(f)) {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j':
        try {
          return JSON.stringify(args[i++]);
        } catch (_) {
          return '[Circular]';
        }
      default:
        return x;
    }
  });
  for (var x = args[i]; i < len; x = args[++i]) {
    if (isNull(x) || !isObject(x)) {
      str += ' ' + x;
    } else {
      str += ' ' + inspect(x);
    }
  }
  return str;
};


// Mark that a method should not be used.
// Returns a modified function which warns once by default.
// If --no-deprecation is set, then it is a no-op.
exports.deprecate = function(fn, msg) {
  // Allow for deprecating things in the process of starting up.
  if (isUndefined(global.process)) {
    return function() {
      return exports.deprecate(fn, msg).apply(this, arguments);
    };
  }

  if (process.noDeprecation === true) {
    return fn;
  }

  var warned = false;
  function deprecated() {
    if (!warned) {
      if (process.throwDeprecation) {
        throw new Error(msg);
      } else if (process.traceDeprecation) {
        console.trace(msg);
      } else {
        console.error(msg);
      }
      warned = true;
    }
    return fn.apply(this, arguments);
  }

  return deprecated;
};


var debugs = {};
var debugEnviron;
exports.debuglog = function(set) {
  if (isUndefined(debugEnviron))
    debugEnviron = process.env.NODE_DEBUG || '';
  set = set.toUpperCase();
  if (!debugs[set]) {
    if (new RegExp('\\b' + set + '\\b', 'i').test(debugEnviron)) {
      var pid = process.pid;
      debugs[set] = function() {
        var msg = exports.format.apply(exports, arguments);
        console.error('%s %d: %s', set, pid, msg);
      };
    } else {
      debugs[set] = function() {};
    }
  }
  return debugs[set];
};


/**
 * Echos the value of a value. Trys to print the value out
 * in the best way possible given the different types.
 *
 * @param {Object} obj The object to print out.
 * @param {Object} opts Optional options object that alters the output.
 */
/* legacy: obj, showHidden, depth, colors*/
function inspect(obj, opts) {
  // default options
  var ctx = {
    seen: [],
    stylize: stylizeNoColor
  };
  // legacy...
  if (arguments.length >= 3) ctx.depth = arguments[2];
  if (arguments.length >= 4) ctx.colors = arguments[3];
  if (isBoolean(opts)) {
    // legacy...
    ctx.showHidden = opts;
  } else if (opts) {
    // got an "options" object
    exports._extend(ctx, opts);
  }
  // set default options
  if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
  if (isUndefined(ctx.depth)) ctx.depth = 2;
  if (isUndefined(ctx.colors)) ctx.colors = false;
  if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
  if (ctx.colors) ctx.stylize = stylizeWithColor;
  return formatValue(ctx, obj, ctx.depth);
}
exports.inspect = inspect;


// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
inspect.colors = {
  'bold' : [1, 22],
  'italic' : [3, 23],
  'underline' : [4, 24],
  'inverse' : [7, 27],
  'white' : [37, 39],
  'grey' : [90, 39],
  'black' : [30, 39],
  'blue' : [34, 39],
  'cyan' : [36, 39],
  'green' : [32, 39],
  'magenta' : [35, 39],
  'red' : [31, 39],
  'yellow' : [33, 39]
};

// Don't use 'blue' not visible on cmd.exe
inspect.styles = {
  'special': 'cyan',
  'number': 'yellow',
  'boolean': 'yellow',
  'undefined': 'grey',
  'null': 'bold',
  'string': 'green',
  'date': 'magenta',
  // "name": intentionally not styling
  'regexp': 'red'
};


function stylizeWithColor(str, styleType) {
  var style = inspect.styles[styleType];

  if (style) {
    return '\u001b[' + inspect.colors[style][0] + 'm' + str +
           '\u001b[' + inspect.colors[style][1] + 'm';
  } else {
    return str;
  }
}


function stylizeNoColor(str, styleType) {
  return str;
}


function arrayToHash(array) {
  var hash = {};

  array.forEach(function(val, idx) {
    hash[val] = true;
  });

  return hash;
}


function formatValue(ctx, value, recurseTimes) {
  // Provide a hook for user-specified inspect functions.
  // Check that value is an object with an inspect function on it
  if (ctx.customInspect &&
      value &&
      isFunction(value.inspect) &&
      // Filter out the util module, it's inspect function is special
      value.inspect !== exports.inspect &&
      // Also filter out any prototype objects using the circular check.
      !(value.constructor && value.constructor.prototype === value)) {
    var ret = value.inspect(recurseTimes, ctx);
    if (!isString(ret)) {
      ret = formatValue(ctx, ret, recurseTimes);
    }
    return ret;
  }

  // Primitive types cannot have properties
  var primitive = formatPrimitive(ctx, value);
  if (primitive) {
    return primitive;
  }

  // Look up the keys of the object.
  var keys = Object.keys(value);
  var visibleKeys = arrayToHash(keys);

  if (ctx.showHidden) {
    keys = Object.getOwnPropertyNames(value);
  }

  // IE doesn't make error fields non-enumerable
  // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
  if (isError(value)
      && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
    return formatError(value);
  }

  // Some type of object without properties can be shortcutted.
  if (keys.length === 0) {
    if (isFunction(value)) {
      var name = value.name ? ': ' + value.name : '';
      return ctx.stylize('[Function' + name + ']', 'special');
    }
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    }
    if (isDate(value)) {
      return ctx.stylize(Date.prototype.toString.call(value), 'date');
    }
    if (isError(value)) {
      return formatError(value);
    }
  }

  var base = '', array = false, braces = ['{', '}'];

  // Make Array say that they are Array
  if (isArray(value)) {
    array = true;
    braces = ['[', ']'];
  }

  // Make functions say that they are functions
  if (isFunction(value)) {
    var n = value.name ? ': ' + value.name : '';
    base = ' [Function' + n + ']';
  }

  // Make RegExps say that they are RegExps
  if (isRegExp(value)) {
    base = ' ' + RegExp.prototype.toString.call(value);
  }

  // Make dates with properties first say the date
  if (isDate(value)) {
    base = ' ' + Date.prototype.toUTCString.call(value);
  }

  // Make error with message first say the error
  if (isError(value)) {
    base = ' ' + formatError(value);
  }

  if (keys.length === 0 && (!array || value.length == 0)) {
    return braces[0] + base + braces[1];
  }

  if (recurseTimes < 0) {
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    } else {
      return ctx.stylize('[Object]', 'special');
    }
  }

  ctx.seen.push(value);

  var output;
  if (array) {
    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
  } else {
    output = keys.map(function(key) {
      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
    });
  }

  ctx.seen.pop();

  return reduceToSingleString(output, base, braces);
}


function formatPrimitive(ctx, value) {
  if (isUndefined(value))
    return ctx.stylize('undefined', 'undefined');
  if (isString(value)) {
    var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                             .replace(/'/g, "\\'")
                                             .replace(/\\"/g, '"') + '\'';
    return ctx.stylize(simple, 'string');
  }
  if (isNumber(value))
    return ctx.stylize('' + value, 'number');
  if (isBoolean(value))
    return ctx.stylize('' + value, 'boolean');
  // For some reason typeof null is "object", so special case here.
  if (isNull(value))
    return ctx.stylize('null', 'null');
}


function formatError(value) {
  return '[' + Error.prototype.toString.call(value) + ']';
}


function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
  var output = [];
  for (var i = 0, l = value.length; i < l; ++i) {
    if (hasOwnProperty(value, String(i))) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          String(i), true));
    } else {
      output.push('');
    }
  }
  keys.forEach(function(key) {
    if (!key.match(/^\d+$/)) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          key, true));
    }
  });
  return output;
}


function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
  var name, str, desc;
  desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
  if (desc.get) {
    if (desc.set) {
      str = ctx.stylize('[Getter/Setter]', 'special');
    } else {
      str = ctx.stylize('[Getter]', 'special');
    }
  } else {
    if (desc.set) {
      str = ctx.stylize('[Setter]', 'special');
    }
  }
  if (!hasOwnProperty(visibleKeys, key)) {
    name = '[' + key + ']';
  }
  if (!str) {
    if (ctx.seen.indexOf(desc.value) < 0) {
      if (isNull(recurseTimes)) {
        str = formatValue(ctx, desc.value, null);
      } else {
        str = formatValue(ctx, desc.value, recurseTimes - 1);
      }
      if (str.indexOf('\n') > -1) {
        if (array) {
          str = str.split('\n').map(function(line) {
            return '  ' + line;
          }).join('\n').substr(2);
        } else {
          str = '\n' + str.split('\n').map(function(line) {
            return '   ' + line;
          }).join('\n');
        }
      }
    } else {
      str = ctx.stylize('[Circular]', 'special');
    }
  }
  if (isUndefined(name)) {
    if (array && key.match(/^\d+$/)) {
      return str;
    }
    name = JSON.stringify('' + key);
    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
      name = name.substr(1, name.length - 2);
      name = ctx.stylize(name, 'name');
    } else {
      name = name.replace(/'/g, "\\'")
                 .replace(/\\"/g, '"')
                 .replace(/(^"|"$)/g, "'");
      name = ctx.stylize(name, 'string');
    }
  }

  return name + ': ' + str;
}


function reduceToSingleString(output, base, braces) {
  var numLinesEst = 0;
  var length = output.reduce(function(prev, cur) {
    numLinesEst++;
    if (cur.indexOf('\n') >= 0) numLinesEst++;
    return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
  }, 0);

  if (length > 60) {
    return braces[0] +
           (base === '' ? '' : base + '\n ') +
           ' ' +
           output.join(',\n  ') +
           ' ' +
           braces[1];
  }

  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
}


// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
function isArray(ar) {
  return Array.isArray(ar);
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return isObject(re) && objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return isObject(e) &&
      (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

exports.isBuffer = require('./support/isBuffer');

function objectToString(o) {
  return Object.prototype.toString.call(o);
}


function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}


var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}


// log is just a thin wrapper to console.log that prepends a timestamp
exports.log = function() {
  console.log('%s - %s', timestamp(), exports.format.apply(exports, arguments));
};


/**
 * Inherit the prototype methods from one constructor into another.
 *
 * The Function.prototype.inherits from lang.js rewritten as a standalone
 * function (not on Function.prototype). NOTE: If this file is to be loaded
 * during bootstrapping this function needs to be rewritten using some native
 * functions as prototype setup using normal JavaScript does not work as
 * expected during bootstrapping (see mirror.js in r114903).
 *
 * @param {function} ctor Constructor function which needs to inherit the
 *     prototype.
 * @param {function} superCtor Constructor function to inherit prototype from.
 */
exports.inherits = require('inherits');

exports._extend = function(origin, add) {
  // Don't do anything if add isn't an object
  if (!add || !isObject(add)) return origin;

  var keys = Object.keys(add);
  var i = keys.length;
  while (i--) {
    origin[keys[i]] = add[keys[i]];
  }
  return origin;
};

function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"./support/isBuffer":94,"_process":80,"inherits":77}]},{},[1])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uL3Vzci9sb2NhbC9saWIvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcGFjay9fcHJlbHVkZS5qcyIsImFwcC9tYWluLmpzIiwibm9kZV9tb2R1bGVzL3dlYnRvcnJlbnQvaW5kZXguanMiLCJub2RlX21vZHVsZXMvd2VidG9ycmVudC9saWIvZmlsZS1zdHJlYW0uanMiLCJub2RlX21vZHVsZXMvd2VidG9ycmVudC9saWIvbWVkaWEtc3RyZWFtLmpzIiwibm9kZV9tb2R1bGVzL3dlYnRvcnJlbnQvbGliL3Jhcml0eS1tYXAuanMiLCJub2RlX21vZHVsZXMvd2VidG9ycmVudC9saWIvc3RvcmFnZS5qcyIsIm5vZGVfbW9kdWxlcy93ZWJ0b3JyZW50L2xpYi90b3JyZW50LmpzIiwibm9kZV9tb2R1bGVzL3dlYnRvcnJlbnQvbm9kZV9tb2R1bGVzL2JpdGZpZWxkL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3dlYnRvcnJlbnQvbm9kZV9tb2R1bGVzL2Jsb2NrLXN0cmVhbS9ibG9jay1zdHJlYW0uanMiLCJub2RlX21vZHVsZXMvd2VidG9ycmVudC9ub2RlX21vZHVsZXMvY3JlYXRlLXRvcnJlbnQvaW5kZXguanMiLCJub2RlX21vZHVsZXMvd2VidG9ycmVudC9ub2RlX21vZHVsZXMvY3JlYXRlLXRvcnJlbnQvbm9kZV9tb2R1bGVzL2JlbmNvZGUvYmVuY29kZS5qcyIsIm5vZGVfbW9kdWxlcy93ZWJ0b3JyZW50L25vZGVfbW9kdWxlcy9jcmVhdGUtdG9ycmVudC9ub2RlX21vZHVsZXMvYmVuY29kZS9saWIvZGVjb2RlLmpzIiwibm9kZV9tb2R1bGVzL3dlYnRvcnJlbnQvbm9kZV9tb2R1bGVzL2NyZWF0ZS10b3JyZW50L25vZGVfbW9kdWxlcy9iZW5jb2RlL2xpYi9kaWN0LmpzIiwibm9kZV9tb2R1bGVzL3dlYnRvcnJlbnQvbm9kZV9tb2R1bGVzL2NyZWF0ZS10b3JyZW50L25vZGVfbW9kdWxlcy9iZW5jb2RlL2xpYi9lbmNvZGUuanMiLCJub2RlX21vZHVsZXMvd2VidG9ycmVudC9ub2RlX21vZHVsZXMvY3JlYXRlLXRvcnJlbnQvbm9kZV9tb2R1bGVzL2ZpbGVzdHJlYW0vbm9kZV9tb2R1bGVzL3R5cGVkYXJyYXktdG8tYnVmZmVyL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3dlYnRvcnJlbnQvbm9kZV9tb2R1bGVzL2NyZWF0ZS10b3JyZW50L25vZGVfbW9kdWxlcy9maWxlc3RyZWFtL25vZGVfbW9kdWxlcy90eXBlZGFycmF5LXRvLWJ1ZmZlci9ub2RlX21vZHVsZXMvaXMtdHlwZWRhcnJheS9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy93ZWJ0b3JyZW50L25vZGVfbW9kdWxlcy9jcmVhdGUtdG9ycmVudC9ub2RlX21vZHVsZXMvZmlsZXN0cmVhbS9yZWFkLmpzIiwibm9kZV9tb2R1bGVzL3dlYnRvcnJlbnQvbm9kZV9tb2R1bGVzL2NyZWF0ZS10b3JyZW50L25vZGVfbW9kdWxlcy9mbGF0dGVuL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3dlYnRvcnJlbnQvbm9kZV9tb2R1bGVzL2NyZWF0ZS10b3JyZW50L25vZGVfbW9kdWxlcy9waWVjZS1sZW5ndGgvaW5kZXguanMiLCJub2RlX21vZHVsZXMvd2VidG9ycmVudC9ub2RlX21vZHVsZXMvY3JlYXRlLXRvcnJlbnQvbm9kZV9tb2R1bGVzL3BpZWNlLWxlbmd0aC9ub2RlX21vZHVsZXMvY2xvc2VzdC10by9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy93ZWJ0b3JyZW50L25vZGVfbW9kdWxlcy9kZWJ1Zy9icm93c2VyLmpzIiwibm9kZV9tb2R1bGVzL3dlYnRvcnJlbnQvbm9kZV9tb2R1bGVzL2RlYnVnL2RlYnVnLmpzIiwibm9kZV9tb2R1bGVzL3dlYnRvcnJlbnQvbm9kZV9tb2R1bGVzL2RlYnVnL25vZGVfbW9kdWxlcy9tcy9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy93ZWJ0b3JyZW50L25vZGVfbW9kdWxlcy9kZXphbGdvL2RlemFsZ28uanMiLCJub2RlX21vZHVsZXMvd2VidG9ycmVudC9ub2RlX21vZHVsZXMvZGV6YWxnby9ub2RlX21vZHVsZXMvYXNhcC9hc2FwLmpzIiwibm9kZV9tb2R1bGVzL3dlYnRvcnJlbnQvbm9kZV9tb2R1bGVzL2RlemFsZ28vbm9kZV9tb2R1bGVzL3dyYXBweS93cmFwcHkuanMiLCJub2RlX21vZHVsZXMvd2VidG9ycmVudC9ub2RlX21vZHVsZXMvZW5kLW9mLXN0cmVhbS9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy93ZWJ0b3JyZW50L25vZGVfbW9kdWxlcy9oYXQvaW5kZXguanMiLCJub2RlX21vZHVsZXMvd2VidG9ycmVudC9ub2RlX21vZHVsZXMvaW5oZXJpdHMvaW5oZXJpdHNfYnJvd3Nlci5qcyIsIm5vZGVfbW9kdWxlcy93ZWJ0b3JyZW50L25vZGVfbW9kdWxlcy9tdWx0aXN0cmVhbS9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy93ZWJ0b3JyZW50L25vZGVfbW9kdWxlcy9vbmNlL29uY2UuanMiLCJub2RlX21vZHVsZXMvd2VidG9ycmVudC9ub2RlX21vZHVsZXMvcGFyc2UtdG9ycmVudC9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy93ZWJ0b3JyZW50L25vZGVfbW9kdWxlcy9wYXJzZS10b3JyZW50L25vZGVfbW9kdWxlcy9tYWduZXQtdXJpL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3dlYnRvcnJlbnQvbm9kZV9tb2R1bGVzL3BhcnNlLXRvcnJlbnQvbm9kZV9tb2R1bGVzL21hZ25ldC11cmkvbm9kZV9tb2R1bGVzL3RoaXJ0eS10d28vbGliL3RoaXJ0eS10d28vaW5kZXguanMiLCJub2RlX21vZHVsZXMvd2VidG9ycmVudC9ub2RlX21vZHVsZXMvcGFyc2UtdG9ycmVudC9ub2RlX21vZHVsZXMvbWFnbmV0LXVyaS9ub2RlX21vZHVsZXMvdGhpcnR5LXR3by9saWIvdGhpcnR5LXR3by90aGlydHktdHdvLmpzIiwibm9kZV9tb2R1bGVzL3dlYnRvcnJlbnQvbm9kZV9tb2R1bGVzL3BhcnNlLXRvcnJlbnQvbm9kZV9tb2R1bGVzL3BhcnNlLXRvcnJlbnQtZmlsZS9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy93ZWJ0b3JyZW50L25vZGVfbW9kdWxlcy9wYXJzZS10b3JyZW50L25vZGVfbW9kdWxlcy9wYXJzZS10b3JyZW50LWZpbGUvbm9kZV9tb2R1bGVzL2JlbmNvZGUvbGliL2RlY29kZS5qcyIsIm5vZGVfbW9kdWxlcy93ZWJ0b3JyZW50L25vZGVfbW9kdWxlcy9wYXJzZS10b3JyZW50L25vZGVfbW9kdWxlcy9wYXJzZS10b3JyZW50LWZpbGUvbm9kZV9tb2R1bGVzL2JlbmNvZGUvbGliL2VuY29kZS5qcyIsIm5vZGVfbW9kdWxlcy93ZWJ0b3JyZW50L25vZGVfbW9kdWxlcy9yZS1lbWl0dGVyL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3dlYnRvcnJlbnQvbm9kZV9tb2R1bGVzL3J1bi1wYXJhbGxlbC9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy93ZWJ0b3JyZW50L25vZGVfbW9kdWxlcy9zaW1wbGUtc2hhMS9icm93c2VyLmpzIiwibm9kZV9tb2R1bGVzL3dlYnRvcnJlbnQvbm9kZV9tb2R1bGVzL3NpbXBsZS1zaGExL25vZGVfbW9kdWxlcy9ydXNoYS9ydXNoYS5qcyIsIm5vZGVfbW9kdWxlcy93ZWJ0b3JyZW50L25vZGVfbW9kdWxlcy9zcGVlZG9tZXRlci9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy93ZWJ0b3JyZW50L25vZGVfbW9kdWxlcy90b3JyZW50LWRpc2NvdmVyeS9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy93ZWJ0b3JyZW50L25vZGVfbW9kdWxlcy90b3JyZW50LWRpc2NvdmVyeS9ub2RlX21vZHVsZXMvd2VidG9ycmVudC10cmFja2VyL2NsaWVudC5qcyIsIm5vZGVfbW9kdWxlcy93ZWJ0b3JyZW50L25vZGVfbW9kdWxlcy90b3JyZW50LWRpc2NvdmVyeS9ub2RlX21vZHVsZXMvd2VidG9ycmVudC10cmFja2VyL25vZGVfbW9kdWxlcy9leHRlbmQuanMvaW5kZXguanMiLCJub2RlX21vZHVsZXMvd2VidG9ycmVudC9ub2RlX21vZHVsZXMvdG9ycmVudC1kaXNjb3Zlcnkvbm9kZV9tb2R1bGVzL3dlYnRvcnJlbnQtdHJhY2tlci9ub2RlX21vZHVsZXMvc2ltcGxlLXBlZXIvaW5kZXguanMiLCJub2RlX21vZHVsZXMvd2VidG9ycmVudC9ub2RlX21vZHVsZXMvdG9ycmVudC1kaXNjb3Zlcnkvbm9kZV9tb2R1bGVzL3dlYnRvcnJlbnQtdHJhY2tlci9ub2RlX21vZHVsZXMvc2ltcGxlLXBlZXIvbm9kZV9tb2R1bGVzL3R5cGVkYXJyYXktdG8tYnVmZmVyL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3dlYnRvcnJlbnQvbm9kZV9tb2R1bGVzL3RvcnJlbnQtZGlzY292ZXJ5L25vZGVfbW9kdWxlcy93ZWJ0b3JyZW50LXRyYWNrZXIvbm9kZV9tb2R1bGVzL3NpbXBsZS13ZWJzb2NrZXQvaW5kZXguanMiLCJub2RlX21vZHVsZXMvd2VidG9ycmVudC9ub2RlX21vZHVsZXMvdXRfbWV0YWRhdGEvaW5kZXguanMiLCJub2RlX21vZHVsZXMvd2VidG9ycmVudC9ub2RlX21vZHVsZXMvdXRfbWV0YWRhdGEvbm9kZV9tb2R1bGVzL2JlbmNvZGUvbGliL2RlY29kZS5qcyIsIm5vZGVfbW9kdWxlcy93ZWJ0b3JyZW50L25vZGVfbW9kdWxlcy91dF9tZXRhZGF0YS9ub2RlX21vZHVsZXMvYmVuY29kZS9saWIvZW5jb2RlLmpzIiwibm9kZV9tb2R1bGVzL3dlYnRvcnJlbnQvbm9kZV9tb2R1bGVzL3dlYnRvcnJlbnQtc3dhcm0vaW5kZXguanMiLCJub2RlX21vZHVsZXMvd2VidG9ycmVudC9ub2RlX21vZHVsZXMvd2VidG9ycmVudC1zd2FybS9ub2RlX21vZHVsZXMvYml0dG9ycmVudC1wcm90b2NvbC9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy93ZWJ0b3JyZW50L25vZGVfbW9kdWxlcy93ZWJ0b3JyZW50LXN3YXJtL25vZGVfbW9kdWxlcy9iaXR0b3JyZW50LXByb3RvY29sL25vZGVfbW9kdWxlcy9iZW5jb2RlL2xpYi9kZWNvZGUuanMiLCJub2RlX21vZHVsZXMvd2VidG9ycmVudC9ub2RlX21vZHVsZXMvd2VidG9ycmVudC1zd2FybS9ub2RlX21vZHVsZXMvYml0dG9ycmVudC1wcm90b2NvbC9ub2RlX21vZHVsZXMvYmVuY29kZS9saWIvZW5jb2RlLmpzIiwibm9kZV9tb2R1bGVzL3dlYnRvcnJlbnQvbm9kZV9tb2R1bGVzL3h0ZW5kL2ltbXV0YWJsZS5qcyIsIm5vZGVfbW9kdWxlcy93ZWJ0b3JyZW50L25vZGVfbW9kdWxlcy94dGVuZC9tdXRhYmxlLmpzIiwibm9kZV9tb2R1bGVzL3dlYnRvcnJlbnQvbm9kZV9tb2R1bGVzL3plcm8tZmlsbC9pbmRleC5qcyIsIi4uLy4uLy4uLy4uLy4uL3Vzci9sb2NhbC9saWIvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbGliL19lbXB0eS5qcyIsIi4uLy4uLy4uLy4uLy4uL3Vzci9sb2NhbC9saWIvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Fzc2VydC9hc3NlcnQuanMiLCIuLi8uLi8uLi8uLi8uLi91c3IvbG9jYWwvbGliL25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9idWZmZXIvaW5kZXguanMiLCIuLi8uLi8uLi8uLi8uLi91c3IvbG9jYWwvbGliL25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9idWZmZXIvbm9kZV9tb2R1bGVzL2Jhc2U2NC1qcy9saWIvYjY0LmpzIiwiLi4vLi4vLi4vLi4vLi4vdXNyL2xvY2FsL2xpYi9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnVmZmVyL25vZGVfbW9kdWxlcy9pZWVlNzU0L2luZGV4LmpzIiwiLi4vLi4vLi4vLi4vLi4vdXNyL2xvY2FsL2xpYi9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnVmZmVyL25vZGVfbW9kdWxlcy9pcy1hcnJheS9pbmRleC5qcyIsIi4uLy4uLy4uLy4uLy4uL3Vzci9sb2NhbC9saWIvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2V2ZW50cy9ldmVudHMuanMiLCIuLi8uLi8uLi8uLi8uLi91c3IvbG9jYWwvbGliL25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9pc2FycmF5L2luZGV4LmpzIiwiLi4vLi4vLi4vLi4vLi4vdXNyL2xvY2FsL2xpYi9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvcGF0aC1icm93c2VyaWZ5L2luZGV4LmpzIiwiLi4vLi4vLi4vLi4vLi4vdXNyL2xvY2FsL2xpYi9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvcHJvY2Vzcy9icm93c2VyLmpzIiwiLi4vLi4vLi4vLi4vLi4vdXNyL2xvY2FsL2xpYi9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvcmVhZGFibGUtc3RyZWFtL2R1cGxleC5qcyIsIi4uLy4uLy4uLy4uLy4uL3Vzci9sb2NhbC9saWIvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3JlYWRhYmxlLXN0cmVhbS9saWIvX3N0cmVhbV9kdXBsZXguanMiLCIuLi8uLi8uLi8uLi8uLi91c3IvbG9jYWwvbGliL25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9yZWFkYWJsZS1zdHJlYW0vbGliL19zdHJlYW1fcGFzc3Rocm91Z2guanMiLCIuLi8uLi8uLi8uLi8uLi91c3IvbG9jYWwvbGliL25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9yZWFkYWJsZS1zdHJlYW0vbGliL19zdHJlYW1fcmVhZGFibGUuanMiLCIuLi8uLi8uLi8uLi8uLi91c3IvbG9jYWwvbGliL25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9yZWFkYWJsZS1zdHJlYW0vbGliL19zdHJlYW1fdHJhbnNmb3JtLmpzIiwiLi4vLi4vLi4vLi4vLi4vdXNyL2xvY2FsL2xpYi9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvcmVhZGFibGUtc3RyZWFtL2xpYi9fc3RyZWFtX3dyaXRhYmxlLmpzIiwiLi4vLi4vLi4vLi4vLi4vdXNyL2xvY2FsL2xpYi9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvcmVhZGFibGUtc3RyZWFtL25vZGVfbW9kdWxlcy9jb3JlLXV0aWwtaXMvbGliL3V0aWwuanMiLCIuLi8uLi8uLi8uLi8uLi91c3IvbG9jYWwvbGliL25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9yZWFkYWJsZS1zdHJlYW0vcGFzc3Rocm91Z2guanMiLCIuLi8uLi8uLi8uLi8uLi91c3IvbG9jYWwvbGliL25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9yZWFkYWJsZS1zdHJlYW0vcmVhZGFibGUuanMiLCIuLi8uLi8uLi8uLi8uLi91c3IvbG9jYWwvbGliL25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9yZWFkYWJsZS1zdHJlYW0vdHJhbnNmb3JtLmpzIiwiLi4vLi4vLi4vLi4vLi4vdXNyL2xvY2FsL2xpYi9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvcmVhZGFibGUtc3RyZWFtL3dyaXRhYmxlLmpzIiwiLi4vLi4vLi4vLi4vLi4vdXNyL2xvY2FsL2xpYi9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvc3RyZWFtLWJyb3dzZXJpZnkvaW5kZXguanMiLCIuLi8uLi8uLi8uLi8uLi91c3IvbG9jYWwvbGliL25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9zdHJpbmdfZGVjb2Rlci9pbmRleC5qcyIsIi4uLy4uLy4uLy4uLy4uL3Vzci9sb2NhbC9saWIvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3V0aWwvc3VwcG9ydC9pc0J1ZmZlckJyb3dzZXIuanMiLCIuLi8uLi8uLi8uLi8uLi91c3IvbG9jYWwvbGliL25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy91dGlsL3V0aWwuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUM1QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUMzUUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FDdEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7O0FDemxCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7O0FDdGhDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7OztBQzdEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7O0FDak5BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQzFXQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUNKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUNwSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FDaEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7QUNyR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQy9CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDYkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9LQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDck1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUN0QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDakhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOURBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQzFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FDckJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7QUNoQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7OztBQzlIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQzFCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7O0FDN0hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7O0FDbkpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7OztBQ3BIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUNyR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25DQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FDekRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDamFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQ2xDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7OztBQ2hIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUN4VkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7O0FDeFZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUMvQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQ3ZGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7OztBQ2hQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7QUNwSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7OztBQ3JHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7QUNwUkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7QUNsb0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7OztBQ3BIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUNyR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNmQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsQkE7O0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDdldBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0ekNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQzdTQTtBQUNBO0FBQ0E7QUFDQTs7O0FDSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDaE9BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMURBO0FBQ0E7OztBQ0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQ3pGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUM5Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUN2N0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FDak5BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7OztBQzdkQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDMUdBO0FBQ0E7O0FDREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNQQTtBQUNBOztBQ0RBO0FBQ0E7O0FDREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdOQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQ0xBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwidmFyIGRhdGFQYXRoID0gJy9Vc2Vycy92YXNvL2h0ZG9jcy9ub2RlLzQuc21vdHJhY2gvYXBwLyc7XG52YXIgdG9ycmVudEZpbGUgPSBkYXRhUGF0aCArICd0b3IvZm9yZXZlci50b3JyZW50JztcblxuXG52YXIgV2ViVG9ycmVudCA9IHJlcXVpcmUoJ3dlYnRvcnJlbnQnKTtcbnZhciBmcyA9IHJlcXVpcmUoJ2ZzJyk7XG5cbnZhciBjbGllbnQgPSBuZXcgV2ViVG9ycmVudCgpO1xudmFyIHRvcnJlbnRGaWxlID0gJ21hZ25ldDo/eHQ9dXJuOmJ0aWg6ZjQxY2EzMjZmOGQyN2EyZGQ1MGIwNDhmZDZhMjY5ZTU1YTNhMTYzNCZkbj1Gb3JldmVyLlMwMUUwMS4xMDgwcC5ydXMuTG9zdEZpbG0uVFYubWt2JnRyPWh0dHAlM0ElMkYlMkZidDYudHJhY2t0b3IuaW4lMkZ0cmFja2VyLnBocCUyRmUyZWE0ZTJmYzQ1ZDQ5ZjVjZTBmYzBjYWJjZmFmY2E5JTJGYW5ub3VuY2UnO1xuXG5jbGllbnQuYWRkKHRvcnJlbnRGaWxlLCB7XG4gICAgdG1wOiBkYXRhUGF0aCArICd0b3IvdG1wJ1xufSwgZnVuY3Rpb24gKHRvcnJlbnQpIHthbGVydCgxKTtcbiAgICAvLyBHb3QgdG9ycmVudCBtZXRhZGF0YSFcbiAgICBjb25zb2xlLmxvZygnVG9ycmVudCBpbmZvIGhhc2g6JywgdG9ycmVudC5pbmZvSGFzaClcbiAgICBjb25zb2xlLmxvZygnTWFnbmV0OicsIHRvcnJlbnQubWFnbmV0VVJJKVxuXG5cbiAgICAvKiAgICB0b3JyZW50LmZpbGVzLmZvckVhY2goZnVuY3Rpb24gKGZpbGUpIHtcbiAgICAgLy8gU3RyZWFtIGVhY2ggZmlsZSB0byB0aGUgZGlza1xuICAgICB2YXIgc291cmNlID0gZmlsZS5jcmVhdGVSZWFkU3RyZWFtKClcbiAgICAgdmFyIGRlc3RpbmF0aW9uID0gZnMuY3JlYXRlV3JpdGVTdHJlYW0oZGF0YVBhdGggKyAndG9yLycgKyBmaWxlLm5hbWUpO1xuICAgICBjb25zb2xlLmxvZyhmaWxlLm5hbWUpXG4gICAgIHNvdXJjZS5waXBlKGRlc3RpbmF0aW9uKVxuICAgICB9KSovXG59KTtcblxuXG4iLCIvLyBUT0RPOiBkaHRQb3J0IGFuZCB0b3JyZW50UG9ydCBzaG91bGQgYmUgY29uc2lzdGVudCBiZXR3ZWVuIHJlc3RhcnRzXG4vLyBUT0RPOiBwZWVySWQgYW5kIG5vZGVJZCBzaG91bGQgYmUgY29uc2lzdGVudCBiZXR3ZWVuIHJlc3RhcnRzXG5cbm1vZHVsZS5leHBvcnRzID0gV2ViVG9ycmVudFxuXG52YXIgY3JlYXRlVG9ycmVudCA9IHJlcXVpcmUoJ2NyZWF0ZS10b3JyZW50JylcbnZhciBkZWJ1ZyA9IHJlcXVpcmUoJ2RlYnVnJykoJ3dlYnRvcnJlbnQnKVxudmFyIERIVCA9IHJlcXVpcmUoJ2JpdHRvcnJlbnQtZGh0L2NsaWVudCcpIC8vIGJyb3dzZXIgZXhjbHVkZVxudmFyIEV2ZW50RW1pdHRlciA9IHJlcXVpcmUoJ2V2ZW50cycpLkV2ZW50RW1pdHRlclxudmFyIGV4dGVuZCA9IHJlcXVpcmUoJ3h0ZW5kJylcbnZhciBoYXQgPSByZXF1aXJlKCdoYXQnKVxudmFyIGluaGVyaXRzID0gcmVxdWlyZSgnaW5oZXJpdHMnKVxudmFyIGxvYWRJUFNldCA9IHJlcXVpcmUoJ2xvYWQtaXAtc2V0JykgLy8gYnJvd3NlciBleGNsdWRlXG52YXIgcGFyYWxsZWwgPSByZXF1aXJlKCdydW4tcGFyYWxsZWwnKVxudmFyIHBhcnNlVG9ycmVudCA9IHJlcXVpcmUoJ3BhcnNlLXRvcnJlbnQnKVxudmFyIHNwZWVkb21ldGVyID0gcmVxdWlyZSgnc3BlZWRvbWV0ZXInKVxudmFyIHplcm9GaWxsID0gcmVxdWlyZSgnemVyby1maWxsJylcblxudmFyIEZTU3RvcmFnZSA9IHJlcXVpcmUoJy4vbGliL2ZzLXN0b3JhZ2UnKSAvLyBicm93c2VyIGV4Y2x1ZGVcbnZhciBTdG9yYWdlID0gcmVxdWlyZSgnLi9saWIvc3RvcmFnZScpXG52YXIgVG9ycmVudCA9IHJlcXVpcmUoJy4vbGliL3RvcnJlbnQnKVxuXG5pbmhlcml0cyhXZWJUb3JyZW50LCBFdmVudEVtaXR0ZXIpXG5cbi8qKlxuICogQml0VG9ycmVudCBjbGllbnQgdmVyc2lvbiBzdHJpbmcgKHVzZWQgaW4gcGVlciBJRCkuXG4gKiBHZW5lcmF0ZWQgZnJvbSBwYWNrYWdlLmpzb24gbWFqb3IgYW5kIG1pbm9yIHZlcnNpb24uIEZvciBleGFtcGxlOlxuICogICAnMC4xNi4xJyAtPiAnMDAxNidcbiAqICAgJzEuMi41JyAtPiAnMDEwMidcbiAqL1xudmFyIFZFUlNJT04gPSAocmVxdWlyZSgnLi9wYWNrYWdlLmpzb24nKS52ZXJzaW9uIHx8ICcwLjAuMScpXG4gIC5tYXRjaCgvKFswLTldKykvZykuc2xpY2UoMCwgMikubWFwKHplcm9GaWxsKDIpKS5qb2luKCcnKVxuXG4vKipcbiAqIFdlYlRvcnJlbnQgQ2xpZW50XG4gKiBAcGFyYW0ge09iamVjdH0gb3B0c1xuICovXG5mdW5jdGlvbiBXZWJUb3JyZW50IChvcHRzKSB7XG4gIHZhciBzZWxmID0gdGhpc1xuICBpZiAoIShzZWxmIGluc3RhbmNlb2YgV2ViVG9ycmVudCkpIHJldHVybiBuZXcgV2ViVG9ycmVudChvcHRzKVxuICBpZiAoIW9wdHMpIG9wdHMgPSB7fVxuICBFdmVudEVtaXR0ZXIuY2FsbChzZWxmKVxuICBpZiAoIWRlYnVnLmVuYWJsZWQpIHNlbGYuc2V0TWF4TGlzdGVuZXJzKDApXG5cbiAgc2VsZi5kZXN0cm95ZWQgPSBmYWxzZVxuICBzZWxmLnRvcnJlbnRQb3J0ID0gb3B0cy50b3JyZW50UG9ydCB8fCAwXG4gIHNlbGYudHJhY2tlciA9IG9wdHMudHJhY2tlciAhPT0gdW5kZWZpbmVkID8gb3B0cy50cmFja2VyIDogdHJ1ZVxuICBzZWxmLnJ0Y0NvbmZpZyA9IG9wdHMucnRjQ29uZmlnXG5cbiAgc2VsZi50b3JyZW50cyA9IFtdXG5cbiAgc2VsZi5kb3dubG9hZFNwZWVkID0gc3BlZWRvbWV0ZXIoKVxuICBzZWxmLnVwbG9hZFNwZWVkID0gc3BlZWRvbWV0ZXIoKVxuXG4gIHNlbGYuc3RvcmFnZSA9IHR5cGVvZiBvcHRzLnN0b3JhZ2UgPT09ICdmdW5jdGlvbidcbiAgICA/IG9wdHMuc3RvcmFnZVxuICAgIDogKG9wdHMuc3RvcmFnZSAhPT0gZmFsc2UgJiYgdHlwZW9mIEZTU3RvcmFnZSA9PT0gJ2Z1bmN0aW9uJyAvKiBicm93c2VyIGV4Y2x1ZGUgKi8pXG4gICAgICA/IEZTU3RvcmFnZVxuICAgICAgOiBTdG9yYWdlXG5cbiAgc2VsZi5wZWVySWQgPSBvcHRzLnBlZXJJZCA9PT0gdW5kZWZpbmVkXG4gICAgPyBuZXcgQnVmZmVyKCctV1cnICsgVkVSU0lPTiArICctJyArIGhhdCg0OCksICd1dGY4JylcbiAgICA6IHR5cGVvZiBvcHRzLnBlZXJJZCA9PT0gJ3N0cmluZydcbiAgICAgID8gbmV3IEJ1ZmZlcihvcHRzLnBlZXJJZCwgJ2hleCcpXG4gICAgICA6IG9wdHMucGVlcklkXG4gIHNlbGYucGVlcklkSGV4ID0gc2VsZi5wZWVySWQudG9TdHJpbmcoJ2hleCcpXG5cbiAgc2VsZi5ub2RlSWQgPSBvcHRzLm5vZGVJZCA9PT0gdW5kZWZpbmVkXG4gICAgPyBuZXcgQnVmZmVyKGhhdCgxNjApLCAnaGV4JylcbiAgICA6IHR5cGVvZiBvcHRzLm5vZGVJZCA9PT0gJ3N0cmluZydcbiAgICAgID8gbmV3IEJ1ZmZlcihvcHRzLm5vZGVJZCwgJ2hleCcpXG4gICAgICA6IG9wdHMubm9kZUlkXG4gIHNlbGYubm9kZUlkSGV4ID0gc2VsZi5ub2RlSWQudG9TdHJpbmcoJ2hleCcpXG5cbiAgLy8gVE9ETzogaW1wbGVtZW50IHdlYnRvcnJlbnQtZGh0XG4gIGlmIChvcHRzLmRodCAhPT0gZmFsc2UgJiYgdHlwZW9mIERIVCA9PT0gJ2Z1bmN0aW9uJyAvKiBicm93c2VyIGV4Y2x1ZGUgKi8pIHtcbiAgICAvLyB1c2UgYSBzaW5nbGUgREhUIGluc3RhbmNlIGZvciBhbGwgdG9ycmVudHMsIHNvIHRoZSByb3V0aW5nIHRhYmxlIGNhbiBiZSByZXVzZWRcbiAgICBzZWxmLmRodCA9IG5ldyBESFQoZXh0ZW5kKHsgbm9kZUlkOiBzZWxmLm5vZGVJZCB9LCBvcHRzLmRodCkpXG4gICAgc2VsZi5kaHQubGlzdGVuKG9wdHMuZGh0UG9ydClcbiAgfVxuXG4gIGRlYnVnKCduZXcgd2VidG9ycmVudCAocGVlcklkICVzLCBub2RlSWQgJXMpJywgc2VsZi5wZWVySWRIZXgsIHNlbGYubm9kZUlkSGV4KVxuXG4gIGlmICh0eXBlb2YgbG9hZElQU2V0ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgbG9hZElQU2V0KG9wdHMuYmxvY2tsaXN0LCB7XG4gICAgICBoZWFkZXJzOiB7ICd1c2VyLWFnZW50JzogJ1dlYlRvcnJlbnQgKGh0dHA6Ly93ZWJ0b3JyZW50LmlvKScgfVxuICAgIH0sIGZ1bmN0aW9uIChlcnIsIGlwU2V0KSB7XG4gICAgICBpZiAoZXJyKSByZXR1cm4gc2VsZi5lcnJvcignZmFpbGVkIHRvIGxvYWQgYmxvY2tsaXN0OiAnICsgZXJyLm1lc3NhZ2UpXG4gICAgICBzZWxmLmJsb2NrZWQgPSBpcFNldFxuICAgICAgcmVhZHkoKVxuICAgIH0pXG4gIH0gZWxzZSBwcm9jZXNzLm5leHRUaWNrKHJlYWR5KVxuXG4gIGZ1bmN0aW9uIHJlYWR5ICgpIHtcbiAgICBpZiAoc2VsZi5kZXN0cm95ZWQpIHJldHVyblxuICAgIHNlbGYucmVhZHkgPSB0cnVlXG4gICAgc2VsZi5lbWl0KCdyZWFkeScpXG4gIH1cbn1cblxuLyoqXG4gKiBTZWVkIHJhdGlvIGZvciBhbGwgdG9ycmVudHMgaW4gdGhlIGNsaWVudC5cbiAqIEB0eXBlIHtudW1iZXJ9XG4gKi9cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShXZWJUb3JyZW50LnByb3RvdHlwZSwgJ3JhdGlvJywge1xuICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXNcbiAgICB2YXIgdXBsb2FkZWQgPSBzZWxmLnRvcnJlbnRzLnJlZHVjZShmdW5jdGlvbiAodG90YWwsIHRvcnJlbnQpIHtcbiAgICAgIHJldHVybiB0b3RhbCArIHRvcnJlbnQudXBsb2FkZWRcbiAgICB9LCAwKVxuICAgIHZhciBkb3dubG9hZGVkID0gc2VsZi50b3JyZW50cy5yZWR1Y2UoZnVuY3Rpb24gKHRvdGFsLCB0b3JyZW50KSB7XG4gICAgICByZXR1cm4gdG90YWwgKyB0b3JyZW50LmRvd25sb2FkZWRcbiAgICB9LCAwKSB8fCAxXG4gICAgcmV0dXJuIHVwbG9hZGVkIC8gZG93bmxvYWRlZFxuICB9XG59KVxuXG4vKipcbiAqIFJldHVybnMgdGhlIHRvcnJlbnQgd2l0aCB0aGUgZ2l2ZW4gYHRvcnJlbnRJZGAuIENvbnZlbmllbmNlIG1ldGhvZC4gRWFzaWVyIHRoYW5cbiAqIHNlYXJjaGluZyB0aHJvdWdoIHRoZSBgY2xpZW50LnRvcnJlbnRzYCBhcnJheS4gUmV0dXJucyBgbnVsbGAgaWYgbm8gbWF0Y2hpbmcgdG9ycmVudFxuICogZm91bmQuXG4gKlxuICogQHBhcmFtICB7c3RyaW5nfEJ1ZmZlcnxPYmplY3R9IHRvcnJlbnRJZFxuICogQHJldHVybiB7VG9ycmVudHxudWxsfVxuICovXG5XZWJUb3JyZW50LnByb3RvdHlwZS5nZXQgPSBmdW5jdGlvbiAodG9ycmVudElkKSB7XG4gIHZhciBzZWxmID0gdGhpc1xuICB2YXIgcGFyc2VkID0gcGFyc2VUb3JyZW50KHRvcnJlbnRJZClcbiAgaWYgKCFwYXJzZWQuaW5mb0hhc2gpIHRocm93IG5ldyBFcnJvcignSW52YWxpZCB0b3JyZW50IGlkZW50aWZpZXInKVxuICBmb3IgKHZhciBpID0gMCwgbGVuID0gc2VsZi50b3JyZW50cy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuICAgIHZhciB0b3JyZW50ID0gc2VsZi50b3JyZW50c1tpXVxuICAgIGlmICh0b3JyZW50LmluZm9IYXNoID09PSBwYXJzZWQuaW5mb0hhc2gpIHJldHVybiB0b3JyZW50XG4gIH1cbiAgcmV0dXJuIG51bGxcbn1cblxuLyoqXG4gKiBTdGFydCBkb3dubG9hZGluZyBhIG5ldyB0b3JyZW50LiBBbGlhc2VkIGFzIGBjbGllbnQuZG93bmxvYWRgLlxuICogQHBhcmFtIHtzdHJpbmd8QnVmZmVyfE9iamVjdH0gdG9ycmVudElkXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0cyB0b3JyZW50LXNwZWNpZmljIG9wdGlvbnNcbiAqIEBwYXJhbSB7ZnVuY3Rpb249fSBvbnRvcnJlbnQgY2FsbGVkIHdoZW4gdGhlIHRvcnJlbnQgaXMgcmVhZHkgKGhhcyBtZXRhZGF0YSlcbiAqL1xuV2ViVG9ycmVudC5wcm90b3R5cGUuYWRkID1cbldlYlRvcnJlbnQucHJvdG90eXBlLmRvd25sb2FkID0gZnVuY3Rpb24gKHRvcnJlbnRJZCwgb3B0cywgb250b3JyZW50KSB7XG4gIHZhciBzZWxmID0gdGhpc1xuICBpZiAoc2VsZi5kZXN0cm95ZWQpIHRocm93IG5ldyBFcnJvcignY2xpZW50IGlzIGRlc3Ryb3llZCcpXG4gIGRlYnVnKCdhZGQgJXMnLCB0b3JyZW50SWQpXG4gIGlmICh0eXBlb2Ygb3B0cyA9PT0gJ2Z1bmN0aW9uJykge1xuICAgIG9udG9ycmVudCA9IG9wdHNcbiAgICBvcHRzID0ge31cbiAgfVxuICBpZiAoIW9wdHMpIG9wdHMgPSB7fVxuXG4gIG9wdHMuY2xpZW50ID0gc2VsZlxuICBvcHRzLnN0b3JhZ2UgPSBvcHRzLnN0b3JhZ2UgfHwgc2VsZi5zdG9yYWdlXG5cbiAgaWYgKCFvcHRzLnN0b3JhZ2VPcHRzKSBvcHRzLnN0b3JhZ2VPcHRzID0ge31cbiAgaWYgKG9wdHMudG1wKSBvcHRzLnN0b3JhZ2VPcHRzLnRtcCA9IG9wdHMudG1wXG5cbiAgdmFyIHRvcnJlbnQgPSBuZXcgVG9ycmVudCh0b3JyZW50SWQsIG9wdHMpXG4gIHNlbGYudG9ycmVudHMucHVzaCh0b3JyZW50KVxuXG4gIGZ1bmN0aW9uIGNsaWVudE9uVG9ycmVudCAoX3RvcnJlbnQpIHtcbiAgICBpZiAodG9ycmVudC5pbmZvSGFzaCA9PT0gX3RvcnJlbnQuaW5mb0hhc2gpIHtcbiAgICAgIG9udG9ycmVudCh0b3JyZW50KVxuICAgICAgc2VsZi5yZW1vdmVMaXN0ZW5lcigndG9ycmVudCcsIGNsaWVudE9uVG9ycmVudClcbiAgICB9XG4gIH1cbiAgaWYgKG9udG9ycmVudCkgc2VsZi5vbigndG9ycmVudCcsIGNsaWVudE9uVG9ycmVudClcblxuICB0b3JyZW50Lm9uKCdlcnJvcicsIGZ1bmN0aW9uIChlcnIpIHtcbiAgICBzZWxmLmVtaXQoJ2Vycm9yJywgZXJyLCB0b3JyZW50KVxuICB9KVxuXG4gIHRvcnJlbnQub24oJ2xpc3RlbmluZycsIGZ1bmN0aW9uIChwb3J0KSB7XG4gICAgc2VsZi5lbWl0KCdsaXN0ZW5pbmcnLCBwb3J0LCB0b3JyZW50KVxuICB9KVxuXG4gIHRvcnJlbnQub24oJ3JlYWR5JywgZnVuY3Rpb24gKCkge1xuICAgIC8vIEVtaXQgJ3RvcnJlbnQnIHdoZW4gYSB0b3JyZW50IGlzIHJlYWR5IHRvIGJlIHVzZWRcbiAgICBkZWJ1ZygndG9ycmVudCcpXG4gICAgc2VsZi5lbWl0KCd0b3JyZW50JywgdG9ycmVudClcbiAgfSlcblxuICByZXR1cm4gdG9ycmVudFxufVxuXG4vKipcbiAqIFN0YXJ0IHNlZWRpbmcgYSBuZXcgZmlsZS9mb2xkZXIuXG4gKiBAcGFyYW0gIHtzdHJpbmd8RmlsZXxGaWxlTGlzdHxCdWZmZXJ8QXJyYXkuPHN0cmluZ3xGaWxlfEJ1ZmZlcj59IGlucHV0XG4gKiBAcGFyYW0gIHtPYmplY3R9IG9wdHNcbiAqIEBwYXJhbSAge2Z1bmN0aW9ufSBvbnNlZWRcbiAqL1xuV2ViVG9ycmVudC5wcm90b3R5cGUuc2VlZCA9IGZ1bmN0aW9uIChpbnB1dCwgb3B0cywgb25zZWVkKSB7XG4gIHZhciBzZWxmID0gdGhpc1xuICBpZiAoc2VsZi5kZXN0cm95ZWQpIHRocm93IG5ldyBFcnJvcignY2xpZW50IGlzIGRlc3Ryb3llZCcpXG4gIGRlYnVnKCdzZWVkICVzJywgaW5wdXQpXG4gIGlmICh0eXBlb2Ygb3B0cyA9PT0gJ2Z1bmN0aW9uJykge1xuICAgIG9uc2VlZCA9IG9wdHNcbiAgICBvcHRzID0ge31cbiAgfVxuICBpZiAoIW9wdHMpIG9wdHMgPSB7fVxuICBpZiAoIW9wdHMuc3RvcmFnZU9wdHMpIG9wdHMuc3RvcmFnZU9wdHMgPSB7fVxuICBvcHRzLnN0b3JhZ2VPcHRzLm5vVmVyaWZ5ID0gdHJ1ZVxuXG4gIGNyZWF0ZVRvcnJlbnQucGFyc2VJbnB1dChpbnB1dCwgb3B0cywgZnVuY3Rpb24gKGVyciwgZmlsZXMpIHtcbiAgICBpZiAoZXJyKSByZXR1cm4gc2VsZi5lbWl0KCdlcnJvcicsIGVycilcbiAgICB2YXIgc3RyZWFtcyA9IGZpbGVzLm1hcChmdW5jdGlvbiAoZmlsZSkgeyByZXR1cm4gZmlsZS5nZXRTdHJlYW0gfSlcblxuICAgIGNyZWF0ZVRvcnJlbnQoaW5wdXQsIG9wdHMsIGZ1bmN0aW9uIChlcnIsIHRvcnJlbnRCdWYpIHtcbiAgICAgIGlmIChlcnIpIHJldHVybiBzZWxmLmVtaXQoJ2Vycm9yJywgZXJyKVxuXG4gICAgICAvLyBpZiBjbGllbnQgd2FzIGRlc3Ryb3llZCBhc3luY3Jvbm91c2x5LCBiYWlsIGVhcmx5IChvciBgYWRkYCB3aWxsIHRocm93KVxuICAgICAgaWYgKHNlbGYuZGVzdHJveWVkKSByZXR1cm5cblxuICAgICAgc2VsZi5hZGQodG9ycmVudEJ1Ziwgb3B0cywgZnVuY3Rpb24gKHRvcnJlbnQpIHtcbiAgICAgICAgdmFyIHRhc2tzID0gW2Z1bmN0aW9uIChjYikge1xuICAgICAgICAgIHRvcnJlbnQuc3RvcmFnZS5sb2FkKHN0cmVhbXMsIGNiKVxuICAgICAgICB9XVxuICAgICAgICBpZiAoc2VsZi5kaHQpIHRhc2tzLnB1c2goZnVuY3Rpb24gKGNiKSB7XG4gICAgICAgICAgdG9ycmVudC5vbignZGh0QW5ub3VuY2UnLCBjYilcbiAgICAgICAgfSlcbiAgICAgICAgcGFyYWxsZWwodGFza3MsIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICBpZiAoZXJyKSByZXR1cm4gc2VsZi5lbWl0KCdlcnJvcicsIGVycilcbiAgICAgICAgICBpZiAob25zZWVkKSBvbnNlZWQodG9ycmVudClcbiAgICAgICAgICBzZWxmLmVtaXQoJ3NlZWQnLCB0b3JyZW50KVxuICAgICAgICB9KVxuICAgICAgfSlcbiAgICB9KVxuICB9KVxufVxuXG4vKipcbiAqIFJlbW92ZSBhIHRvcnJlbnQgZnJvbSB0aGUgY2xpZW50LlxuICogQHBhcmFtICB7c3RyaW5nfEJ1ZmZlcn0gICB0b3JyZW50SWRcbiAqIEBwYXJhbSAge2Z1bmN0aW9ufSBjYlxuICovXG5XZWJUb3JyZW50LnByb3RvdHlwZS5yZW1vdmUgPSBmdW5jdGlvbiAodG9ycmVudElkLCBjYikge1xuICB2YXIgc2VsZiA9IHRoaXNcbiAgdmFyIHRvcnJlbnQgPSBzZWxmLmdldCh0b3JyZW50SWQpXG4gIGlmICghdG9ycmVudCkgdGhyb3cgbmV3IEVycm9yKCdObyB0b3JyZW50IHdpdGggaWQgJyArIHRvcnJlbnRJZClcbiAgZGVidWcoJ3JlbW92ZScpXG4gIHNlbGYudG9ycmVudHMuc3BsaWNlKHNlbGYudG9ycmVudHMuaW5kZXhPZih0b3JyZW50KSwgMSlcbiAgdG9ycmVudC5kZXN0cm95KGNiKVxufVxuXG4vKipcbiAqIERlc3Ryb3kgdGhlIGNsaWVudCwgaW5jbHVkaW5nIGFsbCB0b3JyZW50cyBhbmQgY29ubmVjdGlvbnMgdG8gcGVlcnMuXG4gKiBAcGFyYW0gIHtmdW5jdGlvbn0gY2JcbiAqL1xuV2ViVG9ycmVudC5wcm90b3R5cGUuZGVzdHJveSA9IGZ1bmN0aW9uIChjYikge1xuICB2YXIgc2VsZiA9IHRoaXNcbiAgc2VsZi5kZXN0cm95ZWQgPSB0cnVlXG4gIGRlYnVnKCdkZXN0cm95JylcblxuICB2YXIgdGFza3MgPSBzZWxmLnRvcnJlbnRzLm1hcChmdW5jdGlvbiAodG9ycmVudCkge1xuICAgIHJldHVybiBmdW5jdGlvbiAoY2IpIHtcbiAgICAgIHNlbGYucmVtb3ZlKHRvcnJlbnQuaW5mb0hhc2gsIGNiKVxuICAgIH1cbiAgfSlcblxuICBpZiAoc2VsZi5kaHQpIHRhc2tzLnB1c2goZnVuY3Rpb24gKGNiKSB7XG4gICAgc2VsZi5kaHQuZGVzdHJveShjYilcbiAgfSlcblxuICBwYXJhbGxlbCh0YXNrcywgY2IpXG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IEZpbGVTdHJlYW1cblxudmFyIGRlYnVnID0gcmVxdWlyZSgnZGVidWcnKSgnd2VidG9ycmVudDpmaWxlLXN0cmVhbScpXG52YXIgaW5oZXJpdHMgPSByZXF1aXJlKCdpbmhlcml0cycpXG52YXIgcGF0aCA9IHJlcXVpcmUoJ3BhdGgnKVxudmFyIHN0cmVhbSA9IHJlcXVpcmUoJ3N0cmVhbScpXG52YXIgTWVkaWFTdHJlYW0gPSByZXF1aXJlKCcuL21lZGlhLXN0cmVhbScpXG5cbmluaGVyaXRzKEZpbGVTdHJlYW0sIHN0cmVhbS5SZWFkYWJsZSlcblxuLyoqXG4gKiBBIHJlYWRhYmxlIHN0cmVhbSBvZiBhIHRvcnJlbnQgZmlsZS5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gZmlsZVxuICogQHBhcmFtIHtudW1iZXJ9IG9wdHMuc3RhcnQgc3RyZWFtIHNsaWNlIG9mIGZpbGUsIHN0YXJ0aW5nIGZyb20gdGhpcyBieXRlIChpbmNsdXNpdmUpXG4gKiBAcGFyYW0ge251bWJlcn0gb3B0cy5lbmQgc3RyZWFtIHNsaWNlIG9mIGZpbGUsIGVuZGluZyB3aXRoIHRoaXMgYnl0ZSAoaW5jbHVzaXZlKVxuICogQHBhcmFtIHtudW1iZXJ9IG9wdHMucGllY2VMZW5ndGggbGVuZ3RoIG9mIGFuIGluZGl2aWR1YWwgcGllY2VcbiAqL1xuZnVuY3Rpb24gRmlsZVN0cmVhbSAoZmlsZSwgb3B0cykge1xuICB2YXIgc2VsZiA9IHRoaXNcbiAgaWYgKCEoc2VsZiBpbnN0YW5jZW9mIEZpbGVTdHJlYW0pKSByZXR1cm4gbmV3IEZpbGVTdHJlYW0oZmlsZSwgb3B0cylcbiAgc3RyZWFtLlJlYWRhYmxlLmNhbGwoc2VsZiwgb3B0cylcbiAgZGVidWcoJ25ldyBmaWxlc3RyZWFtICVzJywgSlNPTi5zdHJpbmdpZnkob3B0cykpXG5cbiAgaWYgKCFvcHRzKSBvcHRzID0ge31cbiAgaWYgKCFvcHRzLnN0YXJ0KSBvcHRzLnN0YXJ0ID0gMFxuICBpZiAoIW9wdHMuZW5kKSBvcHRzLmVuZCA9IGZpbGUubGVuZ3RoIC0gMVxuXG4gIHNlbGYubGVuZ3RoID0gb3B0cy5lbmQgLSBvcHRzLnN0YXJ0ICsgMVxuXG4gIHZhciBvZmZzZXQgPSBvcHRzLnN0YXJ0ICsgZmlsZS5vZmZzZXRcbiAgdmFyIHBpZWNlTGVuZ3RoID0gb3B0cy5waWVjZUxlbmd0aFxuXG4gIHNlbGYuc3RhcnRQaWVjZSA9IG9mZnNldCAvIHBpZWNlTGVuZ3RoIHwgMFxuICBzZWxmLmVuZFBpZWNlID0gKG9wdHMuZW5kICsgZmlsZS5vZmZzZXQpIC8gcGllY2VMZW5ndGggfCAwXG5cbiAgc2VsZi5fZXh0bmFtZSA9IHBhdGguZXh0bmFtZShmaWxlLm5hbWUpXG4gIHNlbGYuX3N0b3JhZ2UgPSBmaWxlLnN0b3JhZ2VcbiAgc2VsZi5fcGllY2UgPSBzZWxmLnN0YXJ0UGllY2VcbiAgc2VsZi5fbWlzc2luZyA9IHNlbGYubGVuZ3RoXG4gIHNlbGYuX3JlYWRpbmcgPSBmYWxzZVxuICBzZWxmLl9ub3RpZnlpbmcgPSBmYWxzZVxuICBzZWxmLl9kZXN0cm95ZWQgPSBmYWxzZVxuICBzZWxmLl9jcml0aWNhbExlbmd0aCA9IE1hdGgubWluKCgxMDI0ICogMTAyNCAvIHBpZWNlTGVuZ3RoKSB8IDAsIDIpXG4gIHNlbGYuX29mZnNldCA9IG9mZnNldCAtIChzZWxmLnN0YXJ0UGllY2UgKiBwaWVjZUxlbmd0aClcbn1cblxuRmlsZVN0cmVhbS5wcm90b3R5cGUuX3JlYWQgPSBmdW5jdGlvbiAoKSB7XG4gIGRlYnVnKCdfcmVhZCcpXG4gIHZhciBzZWxmID0gdGhpc1xuICBpZiAoc2VsZi5fcmVhZGluZykgcmV0dXJuXG4gIHNlbGYuX3JlYWRpbmcgPSB0cnVlXG4gIHNlbGYubm90aWZ5KClcbn1cblxuRmlsZVN0cmVhbS5wcm90b3R5cGUubm90aWZ5ID0gZnVuY3Rpb24gKCkge1xuICBkZWJ1Zygnbm90aWZ5JylcbiAgdmFyIHNlbGYgPSB0aGlzXG5cbiAgaWYgKCFzZWxmLl9yZWFkaW5nIHx8IHNlbGYuX21pc3NpbmcgPT09IDApIHJldHVyblxuICBpZiAoIXNlbGYuX3N0b3JhZ2UuYml0ZmllbGQuZ2V0KHNlbGYuX3BpZWNlKSlcbiAgICByZXR1cm4gc2VsZi5fc3RvcmFnZS5lbWl0KCdjcml0aWNhbCcsIHNlbGYuX3BpZWNlLCBzZWxmLl9waWVjZSArIHNlbGYuX2NyaXRpY2FsTGVuZ3RoKVxuXG4gIGlmIChzZWxmLl9ub3RpZnlpbmcpIHJldHVyblxuICBzZWxmLl9ub3RpZnlpbmcgPSB0cnVlXG5cbiAgdmFyIHAgPSBzZWxmLl9waWVjZVxuICBkZWJ1ZygnYmVmb3JlIHJlYWQgJXMnLCBwKVxuICBzZWxmLl9zdG9yYWdlLnJlYWQoc2VsZi5fcGllY2UrKywgZnVuY3Rpb24gKGVyciwgYnVmZmVyKSB7XG4gICAgZGVidWcoJ2FmdGVyIHJlYWQgJXMgKGxlbmd0aCAlcykgKGVyciAlcyknLCBwLCBidWZmZXIubGVuZ3RoLCBlcnIgJiYgZXJyLm1lc3NhZ2UpXG4gICAgc2VsZi5fbm90aWZ5aW5nID0gZmFsc2VcblxuICAgIGlmIChzZWxmLl9kZXN0cm95ZWQpIHJldHVyblxuXG4gICAgaWYgKGVycikge1xuICAgICAgc2VsZi5fc3RvcmFnZS5lbWl0KCdlcnJvcicsIGVycilcbiAgICAgIHJldHVybiBzZWxmLmRlc3Ryb3koZXJyKVxuICAgIH1cblxuICAgIGlmIChzZWxmLl9vZmZzZXQpIHtcbiAgICAgIGJ1ZmZlciA9IGJ1ZmZlci5zbGljZShzZWxmLl9vZmZzZXQpXG4gICAgICBzZWxmLl9vZmZzZXQgPSAwXG4gICAgfVxuXG4gICAgaWYgKHNlbGYuX21pc3NpbmcgPCBidWZmZXIubGVuZ3RoKSB7XG4gICAgICBidWZmZXIgPSBidWZmZXIuc2xpY2UoMCwgc2VsZi5fbWlzc2luZylcbiAgICB9XG4gICAgc2VsZi5fbWlzc2luZyAtPSBidWZmZXIubGVuZ3RoXG5cbiAgICBkZWJ1ZygncHVzaGluZyBidWZmZXIgb2YgbGVuZ3RoICVzJywgYnVmZmVyLmxlbmd0aClcbiAgICBzZWxmLl9yZWFkaW5nID0gZmFsc2VcbiAgICBzZWxmLnB1c2goYnVmZmVyKVxuXG4gICAgaWYgKHNlbGYuX21pc3NpbmcgPT09IDApIHNlbGYucHVzaChudWxsKVxuICB9KVxufVxuXG5GaWxlU3RyZWFtLnByb3RvdHlwZS5waXBlID0gZnVuY3Rpb24gKGRzdCkge1xuICB2YXIgc2VsZiA9IHRoaXNcbiAgdmFyIHBpcGUgPSBzdHJlYW0uUmVhZGFibGUucHJvdG90eXBlLnBpcGVcblxuICAvLyA8dmlkZW8+IG9yIDxhdWRpbz4gdGFnXG4gIGlmIChkc3QgJiYgKGRzdC5ub2RlTmFtZSA9PT0gJ1ZJREVPJyB8fCBkc3Qubm9kZU5hbWUgPT09ICdBVURJTycpKSB7XG4gICAgdmFyIHR5cGUgPSB7XG4gICAgICAnLndlYm0nOiAndmlkZW8vd2VibTsgY29kZWNzPVwidm9yYmlzLHZwOFwiJyxcbiAgICAgICcubXA0JzogJ3ZpZGVvL21wNDsgY29kZWNzPVwiYXZjMS40MmMwMWUsbXA0YS40MC4yXCInLFxuICAgICAgJy5tcDMnOiAnYXVkaW8vbXBlZydcbiAgICB9W3NlbGYuX2V4dG5hbWVdXG4gICAgcmV0dXJuIHBpcGUuY2FsbChzZWxmLCBuZXcgTWVkaWFTdHJlYW0oZHN0LCB7IHR5cGU6IHR5cGUgfSkpXG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIHBpcGUuY2FsbChzZWxmLCBkc3QpXG4gIH1cbn1cblxuRmlsZVN0cmVhbS5wcm90b3R5cGUuZGVzdHJveSA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIHNlbGYgPSB0aGlzXG4gIGlmIChzZWxmLl9kZXN0cm95ZWQpIHJldHVyblxuICBzZWxmLl9kZXN0cm95ZWQgPSB0cnVlXG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IE1lZGlhU3RyZWFtXG5cbnZhciBkZWJ1ZyA9IHJlcXVpcmUoJ2RlYnVnJykoJ3dlYnRvcnJlbnQ6bWVkaWEtc3RyZWFtJylcbnZhciBpbmhlcml0cyA9IHJlcXVpcmUoJ2luaGVyaXRzJylcbnZhciBvbmNlID0gcmVxdWlyZSgnb25jZScpXG52YXIgc3RyZWFtID0gcmVxdWlyZSgnc3RyZWFtJylcblxudmFyIE1lZGlhU291cmNlID0gdHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgJiZcbiAgKHdpbmRvdy5NZWRpYVNvdXJjZSB8fCB3aW5kb3cuV2ViS2l0TWVkaWFTb3VyY2UpXG5cbmluaGVyaXRzKE1lZGlhU3RyZWFtLCBzdHJlYW0uV3JpdGFibGUpXG5cbmZ1bmN0aW9uIE1lZGlhU3RyZWFtIChtZWRpYSwgb3B0cykge1xuICB2YXIgc2VsZiA9IHRoaXNcbiAgaWYgKCEoc2VsZiBpbnN0YW5jZW9mIE1lZGlhU3RyZWFtKSkgcmV0dXJuIG5ldyBNZWRpYVN0cmVhbShtZWRpYSwgb3B0cylcbiAgc3RyZWFtLldyaXRhYmxlLmNhbGwoc2VsZiwgb3B0cylcblxuICBzZWxmLm1lZGlhID0gbWVkaWFcbiAgb3B0cyA9IG9wdHMgfHwge31cbiAgb3B0cy50eXBlID0gb3B0cy50eXBlIHx8ICd2aWRlby93ZWJtOyBjb2RlY3M9XCJ2b3JiaXMsdnA4XCInXG5cbiAgZGVidWcoJ25ldyBtZWRpYXN0cmVhbSAlcyAlcycsIG1lZGlhLCBKU09OLnN0cmluZ2lmeShvcHRzKSlcblxuICBzZWxmLl9tZWRpYVNvdXJjZSA9IG5ldyBNZWRpYVNvdXJjZSgpXG4gIHNlbGYuX3BsYXlpbmcgPSBmYWxzZVxuICBzZWxmLl9zb3VyY2VCdWZmZXIgPSBudWxsXG4gIHNlbGYuX2NiID0gbnVsbFxuXG4gIHNlbGYubWVkaWEuc3JjID0gd2luZG93LlVSTC5jcmVhdGVPYmplY3RVUkwoc2VsZi5fbWVkaWFTb3VyY2UpXG5cbiAgdmFyIHNvdXJjZW9wZW4gPSBvbmNlKGZ1bmN0aW9uICgpIHtcbiAgICBzZWxmLl9zb3VyY2VCdWZmZXIgPSBzZWxmLl9tZWRpYVNvdXJjZS5hZGRTb3VyY2VCdWZmZXIob3B0cy50eXBlKVxuICAgIHNlbGYuX3NvdXJjZUJ1ZmZlci5hZGRFdmVudExpc3RlbmVyKCd1cGRhdGVlbmQnLCBzZWxmLl9mbG93LmJpbmQoc2VsZikpXG4gICAgc2VsZi5fZmxvdygpXG4gIH0pXG4gIHNlbGYuX21lZGlhU291cmNlLmFkZEV2ZW50TGlzdGVuZXIoJ3dlYmtpdHNvdXJjZW9wZW4nLCBzb3VyY2VvcGVuLCBmYWxzZSlcbiAgc2VsZi5fbWVkaWFTb3VyY2UuYWRkRXZlbnRMaXN0ZW5lcignc291cmNlb3BlbicsIHNvdXJjZW9wZW4sIGZhbHNlKVxuXG4gIHNlbGYub24oJ2ZpbmlzaCcsIGZ1bmN0aW9uICgpIHtcbiAgICBkZWJ1ZygnZmluaXNoJylcbiAgICBzZWxmLl9tZWRpYVNvdXJjZS5lbmRPZlN0cmVhbSgpXG4gIH0pXG4gIHdpbmRvdy52cyA9IHNlbGZcbn1cblxuTWVkaWFTdHJlYW0ucHJvdG90eXBlLl93cml0ZSA9IGZ1bmN0aW9uIChjaHVuaywgZW5jb2RpbmcsIGNiKSB7XG4gIHZhciBzZWxmID0gdGhpc1xuICBpZiAoIXNlbGYuX3NvdXJjZUJ1ZmZlcikge1xuICAgIHNlbGYuX2NiID0gZnVuY3Rpb24gKGVycikge1xuICAgICAgaWYgKGVycikgcmV0dXJuIGNiKGVycilcbiAgICAgIHNlbGYuX3dyaXRlKGNodW5rLCBlbmNvZGluZywgY2IpXG4gICAgfVxuICAgIHJldHVyblxuICB9XG5cbiAgaWYgKHNlbGYuX3NvdXJjZUJ1ZmZlci51cGRhdGluZylcbiAgICByZXR1cm4gY2IobmV3IEVycm9yKCdDYW5ub3QgYXBwZW5kIGJ1ZmZlciB3aGlsZSBzb3VyY2UgYnVmZmVyIHVwZGF0aW5nJykpXG5cbiAgc2VsZi5fc291cmNlQnVmZmVyLmFwcGVuZEJ1ZmZlcihjaHVuaylcbiAgZGVidWcoJ2FwcGVuZEJ1ZmZlciAlcycsIGNodW5rLmxlbmd0aClcbiAgc2VsZi5fY2IgPSBjYlxuICBpZiAoIXNlbGYuX3BsYXlpbmcpIHtcbiAgICBzZWxmLm1lZGlhLnBsYXkoKVxuICAgIHNlbGYuX3BsYXlpbmcgPSB0cnVlXG4gIH1cbn1cblxuTWVkaWFTdHJlYW0ucHJvdG90eXBlLl9mbG93ID0gZnVuY3Rpb24gKCkge1xuICB2YXIgc2VsZiA9IHRoaXNcbiAgZGVidWcoJ2Zsb3cnKVxuICBpZiAoc2VsZi5fY2IpIHtcbiAgICBzZWxmLl9jYihudWxsKVxuICB9XG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IFJhcml0eU1hcFxuXG4vKipcbiAqIE1hcHBpbmcgb2YgdG9ycmVudCBwaWVjZXMgdG8gdGhlaXIgcmVzcGVjdGl2ZSBhdmFpbGFiaWxpdHkgaW4gdGhlIHN3YXJtLiBVc2VkIGJ5XG4gKiB0aGUgdG9ycmVudCBtYW5hZ2VyIGZvciBpbXBsZW1lbnRpbmcgdGhlIHJhcmVzdCBwaWVjZSBmaXJzdCBzZWxlY3Rpb24gc3RyYXRlZ3kuXG4gKlxuICogQHBhcmFtIHtTd2FybX0gIHN3YXJtIGJpdHRvcnJlbnQtc3dhcm0gdG8gdHJhY2sgYXZhaWxhYmlsaXR5XG4gKiBAcGFyYW0ge251bWJlcn0gbnVtUGllY2VzIG51bWJlciBvZiBwaWVjZXMgaW4gdGhlIHRvcnJlbnRcbiAqL1xuZnVuY3Rpb24gUmFyaXR5TWFwIChzd2FybSwgbnVtUGllY2VzKSB7XG4gIHZhciBzZWxmID0gdGhpc1xuXG4gIHNlbGYuc3dhcm0gPSBzd2FybVxuICBzZWxmLm51bVBpZWNlcyA9IG51bVBpZWNlc1xuXG4gIGZ1bmN0aW9uIGluaXRXaXJlICh3aXJlKSB7XG4gICAgd2lyZS5vbignaGF2ZScsIGZ1bmN0aW9uIChpbmRleCkge1xuICAgICAgc2VsZi5waWVjZXNbaW5kZXhdKytcbiAgICB9KVxuICAgIHdpcmUub24oJ2JpdGZpZWxkJywgc2VsZi5yZWNhbGN1bGF0ZS5iaW5kKHNlbGYpKVxuICAgIHdpcmUub24oJ2Nsb3NlJywgZnVuY3Rpb24gKCkge1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBzZWxmLm51bVBpZWNlczsgKytpKSB7XG4gICAgICAgIHNlbGYucGllY2VzW2ldIC09IHdpcmUucGVlclBpZWNlcy5nZXQoaSlcbiAgICAgIH1cbiAgICB9KVxuICB9XG5cbiAgc2VsZi5zd2FybS53aXJlcy5mb3JFYWNoKGluaXRXaXJlKVxuICBzZWxmLnN3YXJtLm9uKCd3aXJlJywgZnVuY3Rpb24gKHdpcmUpIHtcbiAgICBzZWxmLnJlY2FsY3VsYXRlKClcbiAgICBpbml0V2lyZSh3aXJlKVxuICB9KVxuXG4gIHNlbGYucmVjYWxjdWxhdGUoKVxufVxuXG4vKipcbiAqIFJlY2FsY3VsYXRlcyBwaWVjZSBhdmFpbGFiaWxpdHkgYWNyb3NzIGFsbCBwZWVycyBpbiB0aGUgc3dhcm0uXG4gKi9cblJhcml0eU1hcC5wcm90b3R5cGUucmVjYWxjdWxhdGUgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBzZWxmID0gdGhpc1xuXG4gIHNlbGYucGllY2VzID0gW11cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBzZWxmLm51bVBpZWNlczsgKytpKSB7XG4gICAgc2VsZi5waWVjZXNbaV0gPSAwXG4gIH1cblxuICBzZWxmLnN3YXJtLndpcmVzLmZvckVhY2goZnVuY3Rpb24gKHdpcmUpIHtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHNlbGYubnVtUGllY2VzOyArK2kpIHtcbiAgICAgIHNlbGYucGllY2VzW2ldICs9IHdpcmUucGVlclBpZWNlcy5nZXQoaSlcbiAgICB9XG4gIH0pXG59XG5cbi8qKlxuICogR2V0IHRoZSBpbmRleCBvZiB0aGUgcmFyZXN0IHBpZWNlLiBPcHRpb25hbGx5LCBwYXNzIGEgZmlsdGVyIGZ1bmN0aW9uIHRvIGV4Y2x1ZGVcbiAqIGNlcnRhaW4gcGllY2VzIChmb3IgaW5zdGFuY2UsIHRob3NlIHRoYXQgd2UgYWxyZWFkeSBoYXZlKS5cbiAqXG4gKiBAcGFyYW0ge2Z1bmN0aW9ufSBwaWVjZUZpbHRlckZ1bmNcbiAqIEByZXR1cm4ge251bWJlcn0gaW5kZXggb2YgcmFyZXN0IHBpZWNlLCBvciAtMVxuICovXG5SYXJpdHlNYXAucHJvdG90eXBlLmdldFJhcmVzdFBpZWNlID0gZnVuY3Rpb24gKHBpZWNlRmlsdGVyRnVuYykge1xuICB2YXIgc2VsZiA9IHRoaXNcbiAgdmFyIGNhbmRpZGF0ZXMgPSBbXVxuICB2YXIgbWluID0gSW5maW5pdHlcbiAgcGllY2VGaWx0ZXJGdW5jID0gcGllY2VGaWx0ZXJGdW5jIHx8IGZ1bmN0aW9uICgpIHsgcmV0dXJuIHRydWUgfVxuXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgc2VsZi5udW1QaWVjZXM7ICsraSkge1xuICAgIGlmICghcGllY2VGaWx0ZXJGdW5jKGkpKSBjb250aW51ZVxuXG4gICAgdmFyIGF2YWlsYWJpbGl0eSA9IHNlbGYucGllY2VzW2ldXG4gICAgaWYgKGF2YWlsYWJpbGl0eSA9PT0gbWluKSB7XG4gICAgICBjYW5kaWRhdGVzLnB1c2goaSlcbiAgICB9IGVsc2UgaWYgKGF2YWlsYWJpbGl0eSA8IG1pbikge1xuICAgICAgY2FuZGlkYXRlcyA9IFsgaSBdXG4gICAgICBtaW4gPSBhdmFpbGFiaWxpdHlcbiAgICB9XG4gIH1cblxuICBpZiAoY2FuZGlkYXRlcy5sZW5ndGggPiAwKSB7XG4gICAgLy8gaWYgdGhlcmUgYXJlIG11bHRpcGxlIHBpZWNlcyB3aXRoIHRoZSBzYW1lIGF2YWlsYWJpbGl0eSwgY2hvb3NlIG9uZSByYW5kb21seVxuICAgIHJldHVybiBjYW5kaWRhdGVzW01hdGgucmFuZG9tKCkgKiBjYW5kaWRhdGVzLmxlbmd0aCB8IDBdXG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIC0xXG4gIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gU3RvcmFnZVxuXG52YXIgQml0RmllbGQgPSByZXF1aXJlKCdiaXRmaWVsZCcpXG52YXIgQmxvY2tTdHJlYW0gPSByZXF1aXJlKCdibG9jay1zdHJlYW0nKVxudmFyIGRlYnVnID0gcmVxdWlyZSgnZGVidWcnKSgnd2VidG9ycmVudDpzdG9yYWdlJylcbnZhciBkZXphbGdvID0gcmVxdWlyZSgnZGV6YWxnbycpXG52YXIgZW9zID0gcmVxdWlyZSgnZW5kLW9mLXN0cmVhbScpXG52YXIgRXZlbnRFbWl0dGVyID0gcmVxdWlyZSgnZXZlbnRzJykuRXZlbnRFbWl0dGVyXG52YXIgRmlsZVN0cmVhbSA9IHJlcXVpcmUoJy4vZmlsZS1zdHJlYW0nKVxudmFyIGluaGVyaXRzID0gcmVxdWlyZSgnaW5oZXJpdHMnKVxudmFyIE11bHRpU3RyZWFtID0gcmVxdWlyZSgnbXVsdGlzdHJlYW0nKVxudmFyIG9uY2UgPSByZXF1aXJlKCdvbmNlJylcbnZhciBzaGExID0gcmVxdWlyZSgnc2ltcGxlLXNoYTEnKVxuXG52YXIgQkxPQ0tfTEVOR1RIID0gMTYgKiAxMDI0XG5cbnZhciBCTE9DS19CTEFOSyA9IDBcbnZhciBCTE9DS19SRVNFUlZFRCA9IDFcbnZhciBCTE9DS19XUklUVEVOID0gMlxuZnVuY3Rpb24gbm9vcCAoKSB7fVxuXG5pbmhlcml0cyhQaWVjZSwgRXZlbnRFbWl0dGVyKVxuXG4vKipcbiAqIEEgdG9ycmVudCBwaWVjZVxuICpcbiAqIEBwYXJhbSB7bnVtYmVyfSBpbmRleCAgcGllY2UgaW5kZXhcbiAqIEBwYXJhbSB7c3RyaW5nfSBoYXNoICAgc2hhMSBoYXNoIChoZXgpIGZvciB0aGlzIHBpZWNlXG4gKiBAcGFyYW0ge0J1ZmZlcnxudW1iZXJ9IGJ1ZmZlciBiYWNraW5nIGJ1ZmZlciwgb3IgcGllY2UgbGVuZ3RoIGlmIGJhY2tpbmcgYnVmZmVyIGlzIGxhenlcbiAqIEBwYXJhbSB7Ym9vbGVhbj19IG5vVmVyaWZ5IHNraXAgcGllY2UgdmVyaWZpY2F0aW9uICh1c2VkIHdoZW4gc2VlZGluZyBhIG5ldyBmaWxlKVxuICovXG5mdW5jdGlvbiBQaWVjZSAoaW5kZXgsIGhhc2gsIGJ1ZmZlciwgbm9WZXJpZnkpIHtcbiAgdmFyIHNlbGYgPSB0aGlzXG4gIEV2ZW50RW1pdHRlci5jYWxsKHNlbGYpXG4gIGlmICghZGVidWcuZW5hYmxlZCkgc2VsZi5zZXRNYXhMaXN0ZW5lcnMoMClcblxuICBzZWxmLmluZGV4ID0gaW5kZXhcbiAgc2VsZi5oYXNoID0gaGFzaFxuICBzZWxmLm5vVmVyaWZ5ID0gISFub1ZlcmlmeVxuXG4gIGlmICh0eXBlb2YgYnVmZmVyID09PSAnbnVtYmVyJykge1xuICAgIC8vIGFsbG9jIGJ1ZmZlciBsYXppbHlcbiAgICBzZWxmLmJ1ZmZlciA9IG51bGxcbiAgICBzZWxmLmxlbmd0aCA9IGJ1ZmZlclxuICB9IGVsc2Uge1xuICAgIC8vIHVzZSBidWZmZXIgcHJvdmlkZWRcbiAgICBzZWxmLmJ1ZmZlciA9IGJ1ZmZlclxuICAgIHNlbGYubGVuZ3RoID0gYnVmZmVyLmxlbmd0aFxuICB9XG5cbiAgc2VsZi5fcmVzZXQoKVxufVxuXG5QaWVjZS5wcm90b3R5cGUucmVhZEJsb2NrID0gZnVuY3Rpb24gKG9mZnNldCwgbGVuZ3RoLCBjYikge1xuICB2YXIgc2VsZiA9IHRoaXNcbiAgY2IgPSBkZXphbGdvKGNiKVxuICBpZiAoIXNlbGYuYnVmZmVyIHx8ICFzZWxmLl92ZXJpZnlPZmZzZXQob2Zmc2V0KSkge1xuICAgIHJldHVybiBjYihuZXcgRXJyb3IoJ2ludmFsaWQgYmxvY2sgb2Zmc2V0ICcgKyBvZmZzZXQpKVxuICB9XG4gIGNiKG51bGwsIHNlbGYuYnVmZmVyLnNsaWNlKG9mZnNldCwgb2Zmc2V0ICsgbGVuZ3RoKSlcbn1cblxuUGllY2UucHJvdG90eXBlLndyaXRlQmxvY2sgPSBmdW5jdGlvbiAob2Zmc2V0LCBidWZmZXIsIGNiKSB7XG4gIHZhciBzZWxmID0gdGhpc1xuICBjYiA9IGRlemFsZ28oY2IpXG4gIGlmICghc2VsZi5fdmVyaWZ5T2Zmc2V0KG9mZnNldCkgfHwgIXNlbGYuX3ZlcmlmeUJsb2NrKG9mZnNldCwgYnVmZmVyKSkge1xuICAgIHJldHVybiBjYihuZXcgRXJyb3IoJ2ludmFsaWQgYmxvY2sgJyArIG9mZnNldCArICc6JyArIGJ1ZmZlci5sZW5ndGgpKVxuICB9XG4gIHNlbGYuX2xhenlBbGxvY0J1ZmZlcigpXG5cbiAgdmFyIGkgPSBvZmZzZXQgLyBCTE9DS19MRU5HVEhcbiAgaWYgKHNlbGYuYmxvY2tzW2ldID09PSBCTE9DS19XUklUVEVOKSB7XG4gICAgcmV0dXJuIGNiKG51bGwpXG4gIH1cblxuICBidWZmZXIuY29weShzZWxmLmJ1ZmZlciwgb2Zmc2V0KVxuICBzZWxmLmJsb2Nrc1tpXSA9IEJMT0NLX1dSSVRURU5cbiAgc2VsZi5ibG9ja3NXcml0dGVuICs9IDFcblxuICBpZiAoc2VsZi5ibG9ja3NXcml0dGVuID09PSBzZWxmLmJsb2Nrcy5sZW5ndGgpIHtcbiAgICBzZWxmLnZlcmlmeSgpXG4gIH1cblxuICBjYihudWxsKVxufVxuXG5QaWVjZS5wcm90b3R5cGUucmVzZXJ2ZUJsb2NrID0gZnVuY3Rpb24gKGVuZEdhbWUpIHtcbiAgdmFyIHNlbGYgPSB0aGlzXG4gIHZhciBsZW4gPSBzZWxmLmJsb2Nrcy5sZW5ndGhcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW47IGkrKykge1xuICAgIGlmICgoc2VsZi5ibG9ja3NbaV0gJiYgIWVuZEdhbWUpIHx8IHNlbGYuYmxvY2tzW2ldID09PSBCTE9DS19XUklUVEVOKSB7XG4gICAgICBjb250aW51ZVxuICAgIH1cbiAgICBzZWxmLmJsb2Nrc1tpXSA9IEJMT0NLX1JFU0VSVkVEXG4gICAgcmV0dXJuIHtcbiAgICAgIG9mZnNldDogaSAqIEJMT0NLX0xFTkdUSCxcbiAgICAgIGxlbmd0aDogKGkgPT09IGxlbiAtIDEpXG4gICAgICAgID8gc2VsZi5sZW5ndGggLSAoaSAqIEJMT0NLX0xFTkdUSClcbiAgICAgICAgOiBCTE9DS19MRU5HVEhcbiAgICB9XG4gIH1cbiAgcmV0dXJuIG51bGxcbn1cblxuUGllY2UucHJvdG90eXBlLmNhbmNlbEJsb2NrID0gZnVuY3Rpb24gKG9mZnNldCkge1xuICB2YXIgc2VsZiA9IHRoaXNcbiAgaWYgKCFzZWxmLl92ZXJpZnlPZmZzZXQob2Zmc2V0KSkge1xuICAgIHJldHVybiBmYWxzZVxuICB9XG5cbiAgdmFyIGkgPSBvZmZzZXQgLyBCTE9DS19MRU5HVEhcbiAgaWYgKHNlbGYuYmxvY2tzW2ldID09PSBCTE9DS19SRVNFUlZFRCkge1xuICAgIHNlbGYuYmxvY2tzW2ldID0gQkxPQ0tfQkxBTktcbiAgfVxuXG4gIHJldHVybiB0cnVlXG59XG5cblBpZWNlLnByb3RvdHlwZS5fcmVzZXQgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBzZWxmID0gdGhpc1xuICBzZWxmLnZlcmlmaWVkID0gZmFsc2VcbiAgc2VsZi5ibG9ja3MgPSBuZXcgQnVmZmVyKE1hdGguY2VpbChzZWxmLmxlbmd0aCAvIEJMT0NLX0xFTkdUSCkpXG4gIHNlbGYuYmxvY2tzLmZpbGwoMClcbiAgc2VsZi5ibG9ja3NXcml0dGVuID0gMFxufVxuXG5QaWVjZS5wcm90b3R5cGUudmVyaWZ5ID0gZnVuY3Rpb24gKGJ1ZmZlcikge1xuICB2YXIgc2VsZiA9IHRoaXNcbiAgYnVmZmVyID0gYnVmZmVyIHx8IHNlbGYuYnVmZmVyXG4gIGlmIChzZWxmLnZlcmlmaWVkIHx8ICFidWZmZXIpIHtcbiAgICByZXR1cm5cbiAgfVxuXG4gIGlmIChzZWxmLm5vVmVyaWZ5KSB7XG4gICAgc2VsZi52ZXJpZmllZCA9IHRydWVcbiAgICBvblJlc3VsdCgpXG4gICAgcmV0dXJuXG4gIH1cblxuICBzaGExKGJ1ZmZlciwgZnVuY3Rpb24gKGV4cGVjdGVkSGFzaCkge1xuICAgIHNlbGYudmVyaWZpZWQgPSAoZXhwZWN0ZWRIYXNoID09PSBzZWxmLmhhc2gpXG4gICAgb25SZXN1bHQoKVxuICB9KVxuXG4gIGZ1bmN0aW9uIG9uUmVzdWx0ICgpIHtcbiAgICBpZiAoc2VsZi52ZXJpZmllZCkge1xuICAgICAgc2VsZi5lbWl0KCdkb25lJylcbiAgICB9IGVsc2Uge1xuICAgICAgc2VsZi5lbWl0KCd3YXJuaW5nJywgbmV3IEVycm9yKCdwaWVjZSAnICsgc2VsZi5pbmRleCArICcgZmFpbGVkIHZlcmlmaWNhdGlvbicpKVxuICAgICAgc2VsZi5fcmVzZXQoKVxuICAgIH1cbiAgfVxufVxuXG5QaWVjZS5wcm90b3R5cGUuX3ZlcmlmeU9mZnNldCA9IGZ1bmN0aW9uIChvZmZzZXQpIHtcbiAgdmFyIHNlbGYgPSB0aGlzXG4gIGlmIChvZmZzZXQgJSBCTE9DS19MRU5HVEggPT09IDApIHtcbiAgICByZXR1cm4gdHJ1ZVxuICB9IGVsc2Uge1xuICAgIHNlbGYuZW1pdChcbiAgICAgICd3YXJuaW5nJyxcbiAgICAgIG5ldyBFcnJvcignaW52YWxpZCBibG9jayBvZmZzZXQgJyArIG9mZnNldCArICcsIG5vdCBtdWx0aXBsZSBvZiAnICsgQkxPQ0tfTEVOR1RIKVxuICAgIClcbiAgICByZXR1cm4gZmFsc2VcbiAgfVxufVxuXG5QaWVjZS5wcm90b3R5cGUuX3ZlcmlmeUJsb2NrID0gZnVuY3Rpb24gKG9mZnNldCwgYnVmZmVyKSB7XG4gIHZhciBzZWxmID0gdGhpc1xuICBpZiAoYnVmZmVyLmxlbmd0aCA9PT0gQkxPQ0tfTEVOR1RIKSB7XG4gICAgLy8gbm9ybWFsIGJsb2NrIGxlbmd0aFxuICAgIHJldHVybiB0cnVlXG4gIH0gZWxzZSBpZiAoYnVmZmVyLmxlbmd0aCA9PT0gc2VsZi5sZW5ndGggLSBvZmZzZXQgJiZcbiAgICBzZWxmLmxlbmd0aCAtIG9mZnNldCA8IEJMT0NLX0xFTkdUSCkge1xuICAgIC8vIGxhc3QgYmxvY2sgaW4gcGllY2UgaXMgYWxsb3dlZCB0byBiZSBsZXNzIHRoYW4gYmxvY2sgbGVuZ3RoXG4gICAgcmV0dXJuIHRydWVcbiAgfSBlbHNlIHtcbiAgICBzZWxmLmVtaXQoJ3dhcm5pbmcnLCBuZXcgRXJyb3IoJ2ludmFsaWQgYmxvY2sgc2l6ZSAnICsgYnVmZmVyLmxlbmd0aCkpXG4gICAgcmV0dXJuIGZhbHNlXG4gIH1cbn1cblxuUGllY2UucHJvdG90eXBlLl9sYXp5QWxsb2NCdWZmZXIgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBzZWxmID0gdGhpc1xuICBpZiAoIXNlbGYuYnVmZmVyKSB7XG4gICAgc2VsZi5idWZmZXIgPSBuZXcgQnVmZmVyKHNlbGYubGVuZ3RoKVxuICB9XG59XG5cbmluaGVyaXRzKEZpbGUsIEV2ZW50RW1pdHRlcilcblxuLyoqXG4gKiBBIHRvcnJlbnQgZmlsZVxuICpcbiAqIEBwYXJhbSB7U3RvcmFnZX0gc3RvcmFnZSAgICAgICBTdG9yYWdlIGNvbnRhaW5lciBvYmplY3RcbiAqIEBwYXJhbSB7T2JqZWN0fSAgZmlsZSAgICAgICAgICB0aGUgZmlsZSBvYmplY3QgZnJvbSB0aGUgcGFyc2VkIHRvcnJlbnRcbiAqIEBwYXJhbSB7QXJyYXkuPFBpZWNlPn0gcGllY2VzICBiYWNraW5nIHBpZWNlcyBmb3IgdGhpcyBmaWxlXG4gKiBAcGFyYW0ge251bWJlcn0gIHBpZWNlTGVuZ3RoICAgdGhlIGxlbmd0aCBpbiBieXRlcyBvZiBhIG5vbi10ZXJtaW5hbCBwaWVjZVxuICovXG5mdW5jdGlvbiBGaWxlIChzdG9yYWdlLCBmaWxlLCBwaWVjZXMsIHBpZWNlTGVuZ3RoKSB7XG4gIHZhciBzZWxmID0gdGhpc1xuICBFdmVudEVtaXR0ZXIuY2FsbChzZWxmKVxuICBpZiAoIWRlYnVnLmVuYWJsZWQpIHNlbGYuc2V0TWF4TGlzdGVuZXJzKDApXG5cbiAgc2VsZi5zdG9yYWdlID0gc3RvcmFnZVxuICBzZWxmLm5hbWUgPSBmaWxlLm5hbWVcbiAgc2VsZi5wYXRoID0gZmlsZS5wYXRoXG4gIHNlbGYubGVuZ3RoID0gZmlsZS5sZW5ndGhcbiAgc2VsZi5vZmZzZXQgPSBmaWxlLm9mZnNldFxuICBzZWxmLnBpZWNlcyA9IHBpZWNlc1xuICBzZWxmLnBpZWNlTGVuZ3RoID0gcGllY2VMZW5ndGhcblxuICBzZWxmLmRvbmUgPSBmYWxzZVxuXG4gIHNlbGYucGllY2VzLmZvckVhY2goZnVuY3Rpb24gKHBpZWNlKSB7XG4gICAgcGllY2Uub24oJ2RvbmUnLCBmdW5jdGlvbiAoKSB7XG4gICAgICBzZWxmLl9jaGVja0RvbmUoKVxuICAgIH0pXG4gIH0pXG5cbiAgLy8gaWYgdGhlIGZpbGUgaXMgemVyby1sZW5ndGgsIGl0IHdpbGwgYmUgZG9uZSB1cG9uIGluaXRpYWxpemF0aW9uXG4gIHNlbGYuX2NoZWNrRG9uZSgpXG59XG5cbi8qKlxuICogU2VsZWN0cyB0aGUgZmlsZSB0byBiZSBkb3dubG9hZGVkLCBidXQgYXQgYSBsb3dlciBwcmlvcml0eSB0aGFuIGZpbGVzIHdpdGggc3RyZWFtcy5cbiAqIFVzZWZ1bCBpZiB5b3Uga25vdyB5b3UgbmVlZCB0aGUgZmlsZSBhdCBhIGxhdGVyIHN0YWdlLlxuICovXG5GaWxlLnByb3RvdHlwZS5zZWxlY3QgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBzZWxmID0gdGhpc1xuICBpZiAoc2VsZi5waWVjZXMubGVuZ3RoID4gMCkge1xuICAgIHZhciBzdGFydCA9IHNlbGYucGllY2VzWzBdLmluZGV4XG4gICAgdmFyIGVuZCA9IHNlbGYucGllY2VzW3NlbGYucGllY2VzLmxlbmd0aCAtIDFdLmluZGV4XG4gICAgc2VsZi5zdG9yYWdlLmVtaXQoJ3NlbGVjdCcsIHN0YXJ0LCBlbmQsIGZhbHNlKVxuICB9XG59XG5cbi8qKlxuICogRGVzZWxlY3RzIHRoZSBmaWxlLCB3aGljaCBtZWFucyBpdCB3b24ndCBiZSBkb3dubG9hZGVkIHVubGVzcyBzb21lb25lIGNyZWF0ZXMgYSBzdHJlYW1cbiAqIGZvciBpdC5cbiAqL1xuRmlsZS5wcm90b3R5cGUuZGVzZWxlY3QgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBzZWxmID0gdGhpc1xuICBpZiAoc2VsZi5waWVjZXMubGVuZ3RoID4gMCkge1xuICAgIHZhciBzdGFydCA9IHNlbGYucGllY2VzWzBdLmluZGV4XG4gICAgdmFyIGVuZCA9IHNlbGYucGllY2VzW3NlbGYucGllY2VzLmxlbmd0aCAtIDFdLmluZGV4XG4gICAgc2VsZi5zdG9yYWdlLmVtaXQoJ2Rlc2VsZWN0Jywgc3RhcnQsIGVuZCwgZmFsc2UpXG4gIH1cbn1cblxuLyoqXG4gKiBDcmVhdGUgYSByZWFkYWJsZSBzdHJlYW0gdG8gdGhlIGZpbGUuIFBpZWNlcyBuZWVkZWQgYnkgdGhlIHN0cmVhbSB3aWxsIGJlIHByaW9yaXRpemVkXG4gKiBoaWdobHkgYW5kIGZldGNoZWQgZnJvbSB0aGUgc3dhcm0gZmlyc3QuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IG9wdHNcbiAqIEBwYXJhbSB7bnVtYmVyfSBvcHRzLnN0YXJ0IHN0cmVhbSBzbGljZSBvZiBmaWxlLCBzdGFydGluZyBmcm9tIHRoaXMgYnl0ZSAoaW5jbHVzaXZlKVxuICogQHBhcmFtIHtudW1iZXJ9IG9wdHMuZW5kICAgc3RyZWFtIHNsaWNlIG9mIGZpbGUsIGVuZGluZyB3aXRoIHRoaXMgYnl0ZSAoaW5jbHVzaXZlKVxuICogQHJldHVybiB7c3RyZWFtLlJlYWRhYmxlfVxuICovXG5GaWxlLnByb3RvdHlwZS5jcmVhdGVSZWFkU3RyZWFtID0gZnVuY3Rpb24gKG9wdHMpIHtcbiAgdmFyIHNlbGYgPSB0aGlzXG4gIGlmICghb3B0cykgb3B0cyA9IHt9XG4gIGlmIChvcHRzLnBpZWNlTGVuZ3RoID09IG51bGwpIG9wdHMucGllY2VMZW5ndGggPSBzZWxmLnBpZWNlTGVuZ3RoXG4gIHZhciBzdHJlYW0gPSBuZXcgRmlsZVN0cmVhbShzZWxmLCBvcHRzKVxuICBzZWxmLnN0b3JhZ2UuZW1pdCgnc2VsZWN0Jywgc3RyZWFtLnN0YXJ0UGllY2UsIHN0cmVhbS5lbmRQaWVjZSwgdHJ1ZSwgc3RyZWFtLm5vdGlmeS5iaW5kKHN0cmVhbSkpXG4gIGVvcyhzdHJlYW0sIGZ1bmN0aW9uICgpIHtcbiAgICBzZWxmLnN0b3JhZ2UuZW1pdCgnZGVzZWxlY3QnLCBzdHJlYW0uc3RhcnRQaWVjZSwgc3RyZWFtLmVuZFBpZWNlLCB0cnVlKVxuICB9KVxuXG4gIHJldHVybiBzdHJlYW1cbn1cblxuLyoqXG4gKiBAcGFyYW0ge2Z1bmN0aW9ufSBjYlxuICovXG5GaWxlLnByb3RvdHlwZS5nZXRCbG9iVVJMID0gZnVuY3Rpb24gKGNiKSB7XG4gIHZhciBzZWxmID0gdGhpc1xuICBzZWxmLmdldEJ1ZmZlcihmdW5jdGlvbiAoZXJyLCBidWYpIHtcbiAgICBpZiAoZXJyKSByZXR1cm4gY2IoZXJyKVxuICAgIHZhciB1cmwgPSBVUkwuY3JlYXRlT2JqZWN0VVJMKG5ldyBCbG9iKFsgYnVmIF0pKVxuICAgIGNiKG51bGwsIHVybClcbiAgfSlcbn1cblxuLyoqXG4gKiBUT0RPOiBkZXRlY3QgZXJyb3JzIGFuZCBjYWxsIGNhbGxiYWNrIHdpdGggZXJyb3JcbiAqIEBwYXJhbSB7ZnVuY3Rpb259IGNiXG4gKi9cbkZpbGUucHJvdG90eXBlLmdldEJ1ZmZlciA9IGZ1bmN0aW9uIChjYikge1xuICB2YXIgc2VsZiA9IHRoaXNcbiAgdmFyIGJ1ZiA9IG5ldyBCdWZmZXIoc2VsZi5sZW5ndGgpXG4gIHZhciBzdGFydCA9IDBcbiAgc2VsZi5jcmVhdGVSZWFkU3RyZWFtKClcbiAgICAub24oJ2RhdGEnLCBmdW5jdGlvbiAoY2h1bmspIHtcbiAgICAgIGNodW5rLmNvcHkoYnVmLCBzdGFydClcbiAgICAgIHN0YXJ0ICs9IGNodW5rLmxlbmd0aFxuICAgIH0pXG4gICAgLm9uKCdlbmQnLCBmdW5jdGlvbiAoKSB7XG4gICAgICBjYihudWxsLCBidWYpXG4gICAgfSlcbn1cblxuRmlsZS5wcm90b3R5cGUuX2NoZWNrRG9uZSA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIHNlbGYgPSB0aGlzXG4gIHNlbGYuZG9uZSA9IHNlbGYucGllY2VzLmV2ZXJ5KGZ1bmN0aW9uIChwaWVjZSkge1xuICAgIHJldHVybiBwaWVjZS52ZXJpZmllZFxuICB9KVxuXG4gIGlmIChzZWxmLmRvbmUpIHtcbiAgICBwcm9jZXNzLm5leHRUaWNrKGZ1bmN0aW9uICgpIHtcbiAgICAgIHNlbGYuZW1pdCgnZG9uZScpXG4gICAgfSlcbiAgfVxufVxuXG5pbmhlcml0cyhTdG9yYWdlLCBFdmVudEVtaXR0ZXIpXG5cbi8qKlxuICogU3RvcmFnZSBmb3IgYSB0b3JyZW50IGRvd25sb2FkLiBIYW5kbGVzIHRoZSBjb21wbGV4aXRpZXMgb2YgcmVhZGluZyBhbmQgd3JpdGluZ1xuICogdG8gcGllY2VzIGFuZCBmaWxlcy5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gcGFyc2VkVG9ycmVudFxuICogQHBhcmFtIHtPYmplY3R9IG9wdHNcbiAqL1xuZnVuY3Rpb24gU3RvcmFnZSAocGFyc2VkVG9ycmVudCwgb3B0cykge1xuICB2YXIgc2VsZiA9IHRoaXNcbiAgRXZlbnRFbWl0dGVyLmNhbGwoc2VsZilcbiAgaWYgKCFkZWJ1Zy5lbmFibGVkKSBzZWxmLnNldE1heExpc3RlbmVycygwKVxuICBvcHRzID0gb3B0cyB8fCB7fVxuXG4gIHNlbGYuYml0ZmllbGQgPSBuZXcgQml0RmllbGQocGFyc2VkVG9ycmVudC5waWVjZXMubGVuZ3RoKVxuXG4gIHNlbGYuZG9uZSA9IGZhbHNlXG4gIHNlbGYuY2xvc2VkID0gZmFsc2VcbiAgc2VsZi5yZWFkb25seSA9IHRydWVcblxuICBpZiAoIW9wdHMubm9idWZmZXIpIHtcbiAgICBzZWxmLmJ1ZmZlciA9IG5ldyBCdWZmZXIocGFyc2VkVG9ycmVudC5sZW5ndGgpXG4gIH1cblxuICB2YXIgcGllY2VMZW5ndGggPSBzZWxmLnBpZWNlTGVuZ3RoID0gcGFyc2VkVG9ycmVudC5waWVjZUxlbmd0aFxuICB2YXIgbGFzdFBpZWNlTGVuZ3RoID0gcGFyc2VkVG9ycmVudC5sYXN0UGllY2VMZW5ndGhcbiAgdmFyIG51bVBpZWNlcyA9IHBhcnNlZFRvcnJlbnQucGllY2VzLmxlbmd0aFxuXG4gIHNlbGYucGllY2VzID0gcGFyc2VkVG9ycmVudC5waWVjZXMubWFwKGZ1bmN0aW9uIChoYXNoLCBpbmRleCkge1xuICAgIHZhciBzdGFydCA9IGluZGV4ICogcGllY2VMZW5ndGhcbiAgICB2YXIgZW5kID0gc3RhcnQgKyAoaW5kZXggPT09IG51bVBpZWNlcyAtIDEgPyBsYXN0UGllY2VMZW5ndGggOiBwaWVjZUxlbmd0aClcblxuICAgIC8vIGlmIHdlJ3JlIGJhY2tlZCBieSBhIGJ1ZmZlciwgdGhlIHBpZWNlJ3MgYnVmZmVyIHdpbGwgcmVmZXJlbmNlIHRoZSBzYW1lIG1lbW9yeS5cbiAgICAvLyBvdGhlcndpc2UsIHRoZSBwaWVjZSdzIGJ1ZmZlciB3aWxsIGJlIGxhemlseSBjcmVhdGVkIG9uIGRlbWFuZFxuICAgIHZhciBidWZmZXIgPSAoc2VsZi5idWZmZXIgPyBzZWxmLmJ1ZmZlci5zbGljZShzdGFydCwgZW5kKSA6IGVuZCAtIHN0YXJ0KVxuXG4gICAgdmFyIHBpZWNlID0gbmV3IFBpZWNlKGluZGV4LCBoYXNoLCBidWZmZXIsICEhb3B0cy5ub1ZlcmlmeSlcbiAgICBwaWVjZS5vbignZG9uZScsIHNlbGYuX29uUGllY2VEb25lLmJpbmQoc2VsZiwgcGllY2UpKVxuICAgIHJldHVybiBwaWVjZVxuICB9KVxuXG4gIHNlbGYuZmlsZXMgPSBwYXJzZWRUb3JyZW50LmZpbGVzLm1hcChmdW5jdGlvbiAoZmlsZU9iaikge1xuICAgIHZhciBzdGFydCA9IGZpbGVPYmoub2Zmc2V0XG4gICAgdmFyIGVuZCA9IHN0YXJ0ICsgZmlsZU9iai5sZW5ndGggLSAxXG5cbiAgICB2YXIgc3RhcnRQaWVjZSA9IHN0YXJ0IC8gcGllY2VMZW5ndGggfCAwXG4gICAgdmFyIGVuZFBpZWNlID0gZW5kIC8gcGllY2VMZW5ndGggfCAwXG4gICAgdmFyIHBpZWNlcyA9IHNlbGYucGllY2VzLnNsaWNlKHN0YXJ0UGllY2UsIGVuZFBpZWNlICsgMSlcblxuICAgIHZhciBmaWxlID0gbmV3IEZpbGUoc2VsZiwgZmlsZU9iaiwgcGllY2VzLCBwaWVjZUxlbmd0aClcbiAgICBmaWxlLm9uKCdkb25lJywgc2VsZi5fb25GaWxlRG9uZS5iaW5kKHNlbGYsIGZpbGUpKVxuICAgIHJldHVybiBmaWxlXG4gIH0pXG59XG5cblN0b3JhZ2UuQkxPQ0tfTEVOR1RIID0gQkxPQ0tfTEVOR1RIXG5cblN0b3JhZ2UucHJvdG90eXBlLmxvYWQgPSBmdW5jdGlvbiAoc3RyZWFtcywgY2IpIHtcbiAgdmFyIHNlbGYgPSB0aGlzXG4gIGlmICghQXJyYXkuaXNBcnJheShzdHJlYW1zKSkgc3RyZWFtcyA9IFsgc3RyZWFtcyBdXG4gIGNiID0gb25jZShjYiB8fCBmdW5jdGlvbiAoKSB7fSlcblxuICBzZWxmLm9uY2UoJ2RvbmUnLCBmdW5jdGlvbiAoKSB7XG4gICAgY2IobnVsbClcbiAgfSlcblxuICB2YXIgcGllY2VJbmRleCA9IDBcbiAgOyhuZXcgTXVsdGlTdHJlYW0oc3RyZWFtcykpXG4gICAgLnBpcGUobmV3IEJsb2NrU3RyZWFtKHNlbGYucGllY2VMZW5ndGgsIHsgbm9wYWQ6IHRydWUgfSkpXG4gICAgLm9uKCdkYXRhJywgZnVuY3Rpb24gKHBpZWNlKSB7XG4gICAgICB2YXIgaW5kZXggPSBwaWVjZUluZGV4XG4gICAgICBwaWVjZUluZGV4ICs9IDFcblxuICAgICAgdmFyIGJsb2NrSW5kZXggPSAwXG4gICAgICB2YXIgcyA9IG5ldyBCbG9ja1N0cmVhbShCTE9DS19MRU5HVEgsIHsgbm9wYWQ6IHRydWUgfSlcbiAgICAgIHMub24oJ2RhdGEnLCBmdW5jdGlvbiAoYmxvY2spIHtcbiAgICAgICAgdmFyIG9mZnNldCA9IGJsb2NrSW5kZXggKiBCTE9DS19MRU5HVEhcbiAgICAgICAgYmxvY2tJbmRleCArPSAxXG5cbiAgICAgICAgc2VsZi53cml0ZUJsb2NrKGluZGV4LCBvZmZzZXQsIGJsb2NrKVxuICAgICAgfSlcbiAgICAgIHMuZW5kKHBpZWNlKVxuICAgIH0pXG4gICAgLm9uKCdlcnJvcicsIGNiKVxufVxuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoU3RvcmFnZS5wcm90b3R5cGUsICdkb3dubG9hZGVkJywge1xuICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXNcbiAgICByZXR1cm4gc2VsZi5waWVjZXMucmVkdWNlKGZ1bmN0aW9uICh0b3RhbCwgcGllY2UpIHtcbiAgICAgIHJldHVybiB0b3RhbCArIChwaWVjZS52ZXJpZmllZCA/IHBpZWNlLmxlbmd0aCA6IHBpZWNlLmJsb2Nrc1dyaXR0ZW4gKiBCTE9DS19MRU5HVEgpXG4gICAgfSwgMClcbiAgfVxufSlcblxuLyoqXG4gKiBUaGUgbnVtYmVyIG9mIG1pc3NpbmcgcGllY2VzLiBVc2VkIHRvIGltcGxlbWVudCAnZW5kIGdhbWUnIG1vZGUuXG4gKi9cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShTdG9yYWdlLnByb3RvdHlwZSwgJ251bU1pc3NpbmcnLCB7XG4gIGdldDogZnVuY3Rpb24gKCkge1xuICAgIHZhciBzZWxmID0gdGhpc1xuICAgIHZhciBudW1NaXNzaW5nID0gc2VsZi5waWVjZXMubGVuZ3RoXG4gICAgZm9yICh2YXIgaW5kZXggPSAwLCBsZW4gPSBzZWxmLnBpZWNlcy5sZW5ndGg7IGluZGV4IDwgbGVuOyBpbmRleCsrKSB7XG4gICAgICBudW1NaXNzaW5nIC09IHNlbGYuYml0ZmllbGQuZ2V0KGluZGV4KVxuICAgIH1cbiAgICByZXR1cm4gbnVtTWlzc2luZ1xuICB9XG59KVxuXG4vKipcbiAqIFJlYWRzIGEgYmxvY2sgZnJvbSBhIHBpZWNlLlxuICpcbiAqIEBwYXJhbSB7bnVtYmVyfSAgICBpbmRleCAgICBwaWVjZSBpbmRleFxuICogQHBhcmFtIHtudW1iZXJ9ICAgIG9mZnNldCAgIGJ5dGUgb2Zmc2V0IHdpdGhpbiBwaWVjZVxuICogQHBhcmFtIHtudW1iZXJ9ICAgIGxlbmd0aCAgIGxlbmd0aCBpbiBieXRlcyB0byByZWFkIGZyb20gcGllY2VcbiAqIEBwYXJhbSB7ZnVuY3Rpb259ICBjYlxuICovXG5TdG9yYWdlLnByb3RvdHlwZS5yZWFkQmxvY2sgPSBmdW5jdGlvbiAoaW5kZXgsIG9mZnNldCwgbGVuZ3RoLCBjYikge1xuICB2YXIgc2VsZiA9IHRoaXNcbiAgY2IgPSBkZXphbGdvKGNiKVxuICB2YXIgcGllY2UgPSBzZWxmLnBpZWNlc1tpbmRleF1cbiAgaWYgKCFwaWVjZSkgcmV0dXJuIGNiKG5ldyBFcnJvcignaW52YWxpZCBwaWVjZSBpbmRleCAnICsgaW5kZXgpKVxuICBwaWVjZS5yZWFkQmxvY2sob2Zmc2V0LCBsZW5ndGgsIGNiKVxufVxuXG4vKipcbiAqIFdyaXRlcyBhIGJsb2NrIHRvIGEgcGllY2UuXG4gKlxuICogQHBhcmFtIHtudW1iZXJ9ICBpbmRleCAgICBwaWVjZSBpbmRleFxuICogQHBhcmFtIHtudW1iZXJ9ICBvZmZzZXQgICBieXRlIG9mZnNldCB3aXRoaW4gcGllY2VcbiAqIEBwYXJhbSB7QnVmZmVyfSAgYnVmZmVyICAgYnVmZmVyIHRvIHdyaXRlXG4gKiBAcGFyYW0ge2Z1bmN0aW9ufSAgY2JcbiAqL1xuU3RvcmFnZS5wcm90b3R5cGUud3JpdGVCbG9jayA9IGZ1bmN0aW9uIChpbmRleCwgb2Zmc2V0LCBidWZmZXIsIGNiKSB7XG4gIHZhciBzZWxmID0gdGhpc1xuICBpZiAoIWNiKSBjYiA9IG5vb3BcbiAgY2IgPSBkZXphbGdvKGNiKVxuXG4gIGlmIChzZWxmLnJlYWRvbmx5KSByZXR1cm4gY2IobmV3IEVycm9yKCdjYW5ub3Qgd3JpdGUgdG8gcmVhZG9ubHkgc3RvcmFnZScpKVxuICB2YXIgcGllY2UgPSBzZWxmLnBpZWNlc1tpbmRleF1cbiAgaWYgKCFwaWVjZSkgcmV0dXJuIGNiKG5ldyBFcnJvcignaW52YWxpZCBwaWVjZSBpbmRleCAnICsgaW5kZXgpKVxuICBwaWVjZS53cml0ZUJsb2NrKG9mZnNldCwgYnVmZmVyLCBjYilcbn1cblxuLyoqXG4gKiBSZWFkcyBhIHBpZWNlIG9yIGEgcmFuZ2Ugb2YgYSBwaWVjZS5cbiAqXG4gKiBAcGFyYW0ge251bWJlcn0gICBpbmRleCAgICAgICAgIHBpZWNlIGluZGV4XG4gKiBAcGFyYW0ge09iamVjdD19ICByYW5nZSAgICAgICAgIG9wdGlvbmFsIHJhbmdlIHdpdGhpbiBwaWVjZVxuICogQHBhcmFtIHtudW1iZXJ9ICAgcmFuZ2Uub2Zmc2V0ICBieXRlIG9mZnNldCB3aXRoaW4gcGllY2VcbiAqIEBwYXJhbSB7bnVtYmVyfSAgIHJhbmdlLmxlbmd0aCAgbGVuZ3RoIGluIGJ5dGVzIHRvIHJlYWQgZnJvbSBwaWVjZVxuICogQHBhcmFtIHtmdW5jdGlvbn0gY2JcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gIGZvcmNlICAgICAgICAgb3B0aW9uYWxseSBvdmVycmlkZXMgZGVmYXVsdCBjaGVjayBwcmV2ZW50aW5nIHJlYWRpbmdcbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZnJvbSB1bnZlcmlmaWVkIHBpZWNlXG4gKi9cblN0b3JhZ2UucHJvdG90eXBlLnJlYWQgPSBmdW5jdGlvbiAoaW5kZXgsIHJhbmdlLCBjYiwgZm9yY2UpIHtcbiAgdmFyIHNlbGYgPSB0aGlzXG5cbiAgaWYgKHR5cGVvZiByYW5nZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgIGZvcmNlID0gY2JcbiAgICBjYiA9IHJhbmdlXG4gICAgcmFuZ2UgPSBudWxsXG4gIH1cbiAgY2IgPSBkZXphbGdvKGNiKVxuXG4gIHZhciBwaWVjZSA9IHNlbGYucGllY2VzW2luZGV4XVxuICBpZiAoIXBpZWNlKSB7XG4gICAgcmV0dXJuIGNiKG5ldyBFcnJvcignaW52YWxpZCBwaWVjZSBpbmRleCAnICsgaW5kZXgpKVxuICB9XG5cbiAgaWYgKCFwaWVjZS52ZXJpZmllZCAmJiAhZm9yY2UpIHtcbiAgICByZXR1cm4gY2IobmV3IEVycm9yKCdTdG9yYWdlLnJlYWQgY2FsbGVkIG9uIGluY29tcGxldGUgcGllY2UgJyArIGluZGV4KSlcbiAgfVxuXG4gIHZhciBvZmZzZXQgPSAwXG4gIHZhciBsZW5ndGggPSBwaWVjZS5sZW5ndGhcblxuICBpZiAocmFuZ2UpIHtcbiAgICBvZmZzZXQgPSByYW5nZS5vZmZzZXQgfHwgMFxuICAgIGxlbmd0aCA9IHJhbmdlLmxlbmd0aCB8fCBsZW5ndGhcbiAgfVxuXG4gIGlmIChwaWVjZS5idWZmZXIpIHtcbiAgICAvLyBzaG9ydGN1dCBmb3IgcGllY2Ugd2l0aCBzdGF0aWMgYmFja2luZyBidWZmZXJcbiAgICByZXR1cm4gY2IobnVsbCwgcGllY2UuYnVmZmVyLnNsaWNlKG9mZnNldCwgb2Zmc2V0ICsgbGVuZ3RoKSlcbiAgfVxuXG4gIHZhciBibG9ja3MgPSBbXVxuICBmdW5jdGlvbiByZWFkTmV4dEJsb2NrICgpIHtcbiAgICBpZiAobGVuZ3RoIDw9IDApIHJldHVybiBjYihudWxsLCBCdWZmZXIuY29uY2F0KGJsb2NrcykpXG5cbiAgICB2YXIgYmxvY2tPZmZzZXQgPSBvZmZzZXRcbiAgICB2YXIgYmxvY2tMZW5ndGggPSBNYXRoLm1pbihCTE9DS19MRU5HVEgsIGxlbmd0aClcblxuICAgIG9mZnNldCArPSBibG9ja0xlbmd0aFxuICAgIGxlbmd0aCAtPSBibG9ja0xlbmd0aFxuXG4gICAgc2VsZi5yZWFkQmxvY2soaW5kZXgsIGJsb2NrT2Zmc2V0LCBibG9ja0xlbmd0aCwgZnVuY3Rpb24gKGVyciwgYmxvY2spIHtcbiAgICAgIGlmIChlcnIpIHJldHVybiBjYihlcnIpXG5cbiAgICAgIGJsb2Nrcy5wdXNoKGJsb2NrKVxuICAgICAgcmVhZE5leHRCbG9jaygpXG4gICAgfSlcbiAgfVxuXG4gIHJlYWROZXh0QmxvY2soKVxufVxuXG4vKipcbiAqIFJlc2VydmVzIGEgYmxvY2sgZnJvbSB0aGUgZ2l2ZW4gcGllY2UuXG4gKlxuICogQHBhcmFtIHtudW1iZXJ9ICBpbmRleCAgICBwaWVjZSBpbmRleFxuICogQHBhcmFtIHtCb29sZWFufSBlbmRHYW1lICB3aGV0aGVyIG9yIG5vdCBlbmQgZ2FtZSBtb2RlIGlzIGVuYWJsZWRcbiAqXG4gKiBAcmV0dXJucyB7T2JqZWN0fG51bGx9IHJlc2VydmF0aW9uIHdpdGggb2Zmc2V0IGFuZCBsZW5ndGggb3IgbnVsbCBpZiBmYWlsZWQuXG4gKi9cblN0b3JhZ2UucHJvdG90eXBlLnJlc2VydmVCbG9jayA9IGZ1bmN0aW9uIChpbmRleCwgZW5kR2FtZSkge1xuICB2YXIgc2VsZiA9IHRoaXNcbiAgdmFyIHBpZWNlID0gc2VsZi5waWVjZXNbaW5kZXhdXG4gIGlmICghcGllY2UpIHJldHVybiBudWxsXG5cbiAgcmV0dXJuIHBpZWNlLnJlc2VydmVCbG9jayhlbmRHYW1lKVxufVxuXG4vKipcbiAqIENhbmNlbHMgYSBwcmV2aW91cyBibG9jayByZXNlcnZhdGlvbiBmcm9tIHRoZSBnaXZlbiBwaWVjZS5cbiAqXG4gKiBAcGFyYW0ge251bWJlcn0gIGluZGV4ICAgcGllY2UgaW5kZXhcbiAqIEBwYXJhbSB7bnVtYmVyfSAgb2Zmc2V0ICBieXRlIG9mZnNldCBvZiBibG9jayBpbiBwaWVjZVxuICpcbiAqIEByZXR1cm5zIHtCb29sZWFufVxuICovXG5TdG9yYWdlLnByb3RvdHlwZS5jYW5jZWxCbG9jayA9IGZ1bmN0aW9uIChpbmRleCwgb2Zmc2V0KSB7XG4gIHZhciBzZWxmID0gdGhpc1xuICB2YXIgcGllY2UgPSBzZWxmLnBpZWNlc1tpbmRleF1cbiAgaWYgKCFwaWVjZSkgcmV0dXJuIGZhbHNlXG5cbiAgcmV0dXJuIHBpZWNlLmNhbmNlbEJsb2NrKG9mZnNldClcbn1cblxuLyoqXG4gKiBSZW1vdmVzIGFuZCBjbGVhbnMgdXAgYW55IGJhY2tpbmcgc3RvcmUgZm9yIHRoaXMgc3RvcmFnZS5cbiAqIEBwYXJhbSB7ZnVuY3Rpb249fSBjYlxuICovXG5TdG9yYWdlLnByb3RvdHlwZS5yZW1vdmUgPSBmdW5jdGlvbiAoY2IpIHtcbiAgaWYgKGNiKSBkZXphbGdvKGNiKShudWxsKVxufVxuXG4vKipcbiAqIENsb3NlcyB0aGUgYmFja2luZyBzdG9yZSBmb3IgdGhpcyBzdG9yYWdlLlxuICogQHBhcmFtIHtmdW5jdGlvbj19IGNiXG4gKi9cblN0b3JhZ2UucHJvdG90eXBlLmNsb3NlID0gZnVuY3Rpb24gKGNiKSB7XG4gIHZhciBzZWxmID0gdGhpc1xuICBzZWxmLmNsb3NlZCA9IHRydWVcbiAgaWYgKGNiKSBkZXphbGdvKGNiKShudWxsKVxufVxuXG4vL1xuLy8gSEVMUEVSIE1FVEhPRFNcbi8vXG5cblN0b3JhZ2UucHJvdG90eXBlLl9vblBpZWNlRG9uZSA9IGZ1bmN0aW9uIChwaWVjZSkge1xuICB2YXIgc2VsZiA9IHRoaXNcbiAgc2VsZi5iaXRmaWVsZC5zZXQocGllY2UuaW5kZXgpXG4gIGRlYnVnKCdwaWVjZSBkb25lICcgKyBwaWVjZS5pbmRleCArICcgKCcgKyBzZWxmLm51bU1pc3NpbmcgKyAnIHN0aWxsIG1pc3NpbmcpJylcbiAgc2VsZi5lbWl0KCdwaWVjZScsIHBpZWNlKVxufVxuXG5TdG9yYWdlLnByb3RvdHlwZS5fb25GaWxlRG9uZSA9IGZ1bmN0aW9uIChmaWxlKSB7XG4gIHZhciBzZWxmID0gdGhpc1xuICBkZWJ1ZygnZmlsZSBkb25lICcgKyBmaWxlLm5hbWUpXG4gIHNlbGYuZW1pdCgnZmlsZScsIGZpbGUpXG5cbiAgc2VsZi5fY2hlY2tEb25lKClcbn1cblxuU3RvcmFnZS5wcm90b3R5cGUuX2NoZWNrRG9uZSA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIHNlbGYgPSB0aGlzXG5cbiAgaWYgKCFzZWxmLmRvbmUgJiYgc2VsZi5maWxlcy5ldmVyeShmdW5jdGlvbiAoZmlsZSkgeyByZXR1cm4gZmlsZS5kb25lIH0pKSB7XG4gICAgc2VsZi5kb25lID0gdHJ1ZVxuICAgIHNlbGYuZW1pdCgnZG9uZScpXG4gIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gVG9ycmVudFxuXG52YXIgYWRkclRvSVBQb3J0ID0gcmVxdWlyZSgnYWRkci10by1pcC1wb3J0JykgLy8gYnJvd3NlciBleGNsdWRlXG52YXIgZGVidWcgPSByZXF1aXJlKCdkZWJ1ZycpKCd3ZWJ0b3JyZW50OnRvcnJlbnQnKVxudmFyIERpc2NvdmVyeSA9IHJlcXVpcmUoJ3RvcnJlbnQtZGlzY292ZXJ5JylcbnZhciBFdmVudEVtaXR0ZXIgPSByZXF1aXJlKCdldmVudHMnKS5FdmVudEVtaXR0ZXJcbnZhciBmcyA9IHJlcXVpcmUoJ2ZzJykgLy8gYnJvd3NlciBleGNsdWRlXG52YXIgZ2V0ID0gcmVxdWlyZSgnc2ltcGxlLWdldCcpIC8vIGJyb3dzZXIgZXhjbHVkZVxudmFyIGluaGVyaXRzID0gcmVxdWlyZSgnaW5oZXJpdHMnKVxudmFyIHBhcmFsbGVsID0gcmVxdWlyZSgncnVuLXBhcmFsbGVsJylcbnZhciBwYXJzZVRvcnJlbnQgPSByZXF1aXJlKCdwYXJzZS10b3JyZW50JylcbnZhciByZWVtaXQgPSByZXF1aXJlKCdyZS1lbWl0dGVyJylcbnZhciBTd2FybSA9IHJlcXVpcmUoJ2JpdHRvcnJlbnQtc3dhcm0nKSAvLyBgd2VidG9ycmVudC1zd2FybWAgaW4gYnJvd3NlclxudmFyIHV0X21ldGFkYXRhID0gcmVxdWlyZSgndXRfbWV0YWRhdGEnKVxudmFyIHV0X3BleCA9IHJlcXVpcmUoJ3V0X3BleCcpIC8vIGJyb3dzZXIgZXhjbHVkZVxuXG52YXIgUmFyaXR5TWFwID0gcmVxdWlyZSgnLi9yYXJpdHktbWFwJylcbnZhciBTZXJ2ZXIgPSByZXF1aXJlKCcuL3NlcnZlcicpIC8vIGJyb3dzZXIgZXhjbHVkZVxudmFyIFN0b3JhZ2UgPSByZXF1aXJlKCcuL3N0b3JhZ2UnKVxuXG52YXIgTUFYX0JMT0NLX0xFTkdUSCA9IDEyOCAqIDEwMjRcbnZhciBQSUVDRV9USU1FT1VUID0gMTAwMDBcbnZhciBDSE9LRV9USU1FT1VUID0gNTAwMFxudmFyIFNQRUVEX1RIUkVTSE9MRCA9IDMgKiBTdG9yYWdlLkJMT0NLX0xFTkdUSFxuXG52YXIgUElQRUxJTkVfTUlOX0RVUkFUSU9OID0gMC41XG52YXIgUElQRUxJTkVfTUFYX0RVUkFUSU9OID0gMVxuXG52YXIgUkVDSE9LRV9JTlRFUlZBTCA9IDEwMDAwIC8vIDEwIHNlY29uZHNcbnZhciBSRUNIT0tFX09QVElNSVNUSUNfRFVSQVRJT04gPSAyIC8vIDMwIHNlY29uZHNcblxuZnVuY3Rpb24gbm9vcCAoKSB7fVxuXG5pbmhlcml0cyhUb3JyZW50LCBFdmVudEVtaXR0ZXIpXG5cbi8qKlxuICogQSB0b3JyZW50XG4gKlxuICogQHBhcmFtIHtzdHJpbmd8QnVmZmVyfE9iamVjdH0gdG9ycmVudElkXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0c1xuICovXG5mdW5jdGlvbiBUb3JyZW50ICh0b3JyZW50SWQsIG9wdHMpIHtcbiAgdmFyIHNlbGYgPSB0aGlzXG4gIEV2ZW50RW1pdHRlci5jYWxsKHNlbGYpXG4gIGlmICghZGVidWcuZW5hYmxlZCkgc2VsZi5zZXRNYXhMaXN0ZW5lcnMoMClcbiAgZGVidWcoJ25ldyB0b3JyZW50JylcblxuICBzZWxmLmNsaWVudCA9IG9wdHMuY2xpZW50XG5cbiAgc2VsZi5ob3Rzd2FwRW5hYmxlZCA9ICgnaG90c3dhcCcgaW4gb3B0cyA/IG9wdHMuaG90c3dhcCA6IHRydWUpXG4gIHNlbGYudmVyaWZ5ID0gb3B0cy52ZXJpZnlcbiAgc2VsZi5zdG9yYWdlT3B0cyA9IG9wdHMuc3RvcmFnZU9wdHNcblxuICBzZWxmLmNob2tlVGltZW91dCA9IG9wdHMuY2hva2VUaW1lb3V0IHx8IENIT0tFX1RJTUVPVVRcbiAgc2VsZi5waWVjZVRpbWVvdXQgPSBvcHRzLnBpZWNlVGltZW91dCB8fCBQSUVDRV9USU1FT1VUXG4gIHNlbGYuc3RyYXRlZ3kgPSBvcHRzLnN0cmF0ZWd5IHx8ICdzZXF1ZW50aWFsJ1xuXG4gIHNlbGYuX3JlY2hva2VOdW1TbG90cyA9IChvcHRzLnVwbG9hZHMgPT09IGZhbHNlIHx8IG9wdHMudXBsb2FkcyA9PT0gMCkgPyAwIDogKCtvcHRzLnVwbG9hZHMgfHwgMTApXG4gIHNlbGYuX3JlY2hva2VPcHRpbWlzdGljV2lyZSA9IG51bGxcbiAgc2VsZi5fcmVjaG9rZU9wdGltaXN0aWNUaW1lID0gMFxuICBzZWxmLl9yZWNob2tlSW50ZXJ2YWxJZCA9IG51bGxcblxuICBzZWxmLnJlYWR5ID0gZmFsc2VcbiAgc2VsZi5maWxlcyA9IFtdXG4gIHNlbGYubWV0YWRhdGEgPSBudWxsXG4gIHNlbGYucGFyc2VkVG9ycmVudCA9IG51bGxcbiAgc2VsZi5zdG9yYWdlID0gbnVsbFxuICBzZWxmLm51bUJsb2NrZWRQZWVycyA9IDBcbiAgc2VsZi5fYW1JbnRlcmVzdGVkID0gZmFsc2VcbiAgc2VsZi5fZGVzdHJveWVkID0gZmFsc2VcbiAgc2VsZi5fc2VsZWN0aW9ucyA9IFtdXG4gIHNlbGYuX2NyaXRpY2FsID0gW11cbiAgc2VsZi5fc3RvcmFnZUltcGwgPSBvcHRzLnN0b3JhZ2UgfHwgU3RvcmFnZVxuXG4gIHZhciBwYXJzZWRUb3JyZW50XG4gIHRyeSB7XG4gICAgcGFyc2VkVG9ycmVudCA9ICh0b3JyZW50SWQgJiYgdG9ycmVudElkLnBhcnNlZFRvcnJlbnQpIHx8IHBhcnNlVG9ycmVudCh0b3JyZW50SWQpXG4gIH0gY2F0Y2ggKGVycikge1xuICAgIC8vIElmIHRvcnJlbnQgZmFpbHMgdG8gcGFyc2UsIGl0IGNvdWxkIGJlIGFuIGh0dHAvaHR0cHMgVVJMIG9yIGZpbGVzeXN0ZW0gcGF0aCwgc29cbiAgICAvLyBkb24ndCBjb25zaWRlciBpdCBhbiBlcnJvciB5ZXQuXG4gIH1cblxuICBpZiAocGFyc2VkVG9ycmVudCAmJiBwYXJzZWRUb3JyZW50LmluZm9IYXNoKSB7XG4gICAgb25Ub3JyZW50SWQocGFyc2VkVG9ycmVudClcbiAgfSBlbHNlIGlmICh0eXBlb2YgZ2V0ID09PSAnZnVuY3Rpb24nICYmIC9eaHR0cHM/Oi8udGVzdCh0b3JyZW50SWQpKSB7XG4gICAgLy8gaHR0cCBvciBodHRwcyB1cmwgdG8gdG9ycmVudCBmaWxlXG4gICAgZ2V0LmNvbmNhdCh7XG4gICAgICB1cmw6IHRvcnJlbnRJZCxcbiAgICAgIGhlYWRlcnM6IHsgJ3VzZXItYWdlbnQnOiAnV2ViVG9ycmVudCAoaHR0cDovL3dlYnRvcnJlbnQuaW8pJyB9XG4gICAgfSwgZnVuY3Rpb24gKGVyciwgZGF0YSkge1xuICAgICAgaWYgKGVycikge1xuICAgICAgICBlcnIgPSBuZXcgRXJyb3IoJ0Vycm9yIGRvd25sb2FkaW5nIHRvcnJlbnQ6ICcgKyBlcnIubWVzc2FnZSlcbiAgICAgICAgcmV0dXJuIHNlbGYuZW1pdCgnZXJyb3InLCBlcnIpXG4gICAgICB9XG4gICAgICBvblRvcnJlbnRJZChkYXRhKVxuICAgIH0pXG4gIH0gZWxzZSBpZiAodHlwZW9mIGZzLnJlYWRGaWxlID09PSAnZnVuY3Rpb24nKSB7XG4gICAgLy8gYXNzdW1lIGl0J3MgYSBmaWxlc3lzdGVtIHBhdGhcbiAgICBmcy5yZWFkRmlsZSh0b3JyZW50SWQsIGZ1bmN0aW9uIChlcnIsIHRvcnJlbnQpIHtcbiAgICAgIGlmIChlcnIpIHJldHVybiBzZWxmLmVtaXQoJ2Vycm9yJywgbmV3IEVycm9yKCdJbnZhbGlkIHRvcnJlbnQgaWRlbnRpZmllcicpKVxuICAgICAgb25Ub3JyZW50SWQodG9ycmVudClcbiAgICB9KVxuICB9IGVsc2UgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIHRvcnJlbnQgaWRlbnRpZmllcicpXG5cbiAgZnVuY3Rpb24gb25Ub3JyZW50SWQgKHRvcnJlbnRJZCkge1xuICAgIHRyeSB7XG4gICAgICBzZWxmLnBhcnNlZFRvcnJlbnQgPSBwYXJzZVRvcnJlbnQodG9ycmVudElkKVxuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgcmV0dXJuIHNlbGYuZW1pdCgnZXJyb3InLCBuZXcgRXJyb3IoJ01hbGZvcm1lZCB0b3JyZW50IGRhdGE6ICcgKyBlcnIubWVzc2FnZSkpXG4gICAgfVxuXG4gICAgc2VsZi5pbmZvSGFzaCA9IHNlbGYucGFyc2VkVG9ycmVudC5pbmZvSGFzaFxuXG4gICAgaWYgKCFzZWxmLmluZm9IYXNoKSB7XG4gICAgICByZXR1cm4gc2VsZi5lbWl0KCdlcnJvcicsIG5ldyBFcnJvcignTWFsZm9ybWVkIHRvcnJlbnQgZGF0YTogTWlzc2luZyBpbmZvIGhhc2guJykpXG4gICAgfVxuXG4gICAgaWYgKHNlbGYucGFyc2VkVG9ycmVudC5uYW1lKSBzZWxmLm5hbWUgPSBzZWxmLnBhcnNlZFRvcnJlbnQubmFtZSAvLyBwcmVsaW1pbmFyeSBuYW1lXG5cbiAgICAvLyBjcmVhdGUgc3dhcm1cbiAgICBzZWxmLnN3YXJtID0gbmV3IFN3YXJtKHNlbGYuaW5mb0hhc2gsIHNlbGYuY2xpZW50LnBlZXJJZCwge1xuICAgICAgaGFuZHNoYWtlOiB7IGRodDogISFzZWxmLmNsaWVudC5kaHQgfVxuICAgIH0pXG4gICAgcmVlbWl0KHNlbGYuc3dhcm0sIHNlbGYsIFsnd2FybmluZycsICdlcnJvciddKVxuICAgIHNlbGYuc3dhcm0ub24oJ3dpcmUnLCBzZWxmLl9vbldpcmUuYmluZChzZWxmKSlcblxuICAgIC8vIHVwZGF0ZSBvdmVyYWxsIGNsaWVudCBzdGF0c1xuICAgIHNlbGYuc3dhcm0ub24oJ2Rvd25sb2FkJywgc2VsZi5jbGllbnQuZG93bmxvYWRTcGVlZC5iaW5kKHNlbGYuY2xpZW50KSlcbiAgICBzZWxmLnN3YXJtLm9uKCd1cGxvYWQnLCBzZWxmLmNsaWVudC51cGxvYWRTcGVlZC5iaW5kKHNlbGYuY2xpZW50KSlcblxuICAgIGlmIChwcm9jZXNzLmJyb3dzZXIpIHtcbiAgICAgIC8vIGluIGJyb3dzZXIsIHN3YXJtIGRvZXMgbm90IGxpc3RlblxuICAgICAgc2VsZi5fb25Td2FybUxpc3RlbmluZygpXG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIGxpc3RlbiBmb3IgcGVlcnNcbiAgICAgIHNlbGYuc3dhcm0ubGlzdGVuKHNlbGYuY2xpZW50LnRvcnJlbnRQb3J0LCBzZWxmLl9vblN3YXJtTGlzdGVuaW5nLmJpbmQoc2VsZikpXG4gICAgfVxuICAgIHByb2Nlc3MubmV4dFRpY2soZnVuY3Rpb24gKCkge1xuICAgICAgc2VsZi5lbWl0KCdpbmZvSGFzaCcpXG4gICAgfSlcbiAgfVxufVxuXG4vLyB0b3JyZW50IHNpemUgKGluIGJ5dGVzKVxuT2JqZWN0LmRlZmluZVByb3BlcnR5KFRvcnJlbnQucHJvdG90eXBlLCAnbGVuZ3RoJywge1xuICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gKHRoaXMucGFyc2VkVG9ycmVudCAmJiB0aGlzLnBhcnNlZFRvcnJlbnQubGVuZ3RoKSB8fCAwXG4gIH1cbn0pXG5cbi8vIHRpbWUgcmVtYWluaW5nIChpbiBtaWxsaXNlY29uZHMpXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoVG9ycmVudC5wcm90b3R5cGUsICd0aW1lUmVtYWluaW5nJywge1xuICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICBpZiAodGhpcy5zd2FybS5kb3dubG9hZFNwZWVkKCkgPT09IDApIHJldHVybiBJbmZpbml0eVxuICAgIGVsc2UgcmV0dXJuICgodGhpcy5sZW5ndGggLSB0aGlzLmRvd25sb2FkZWQpIC8gdGhpcy5zd2FybS5kb3dubG9hZFNwZWVkKCkpICogMTAwMFxuICB9XG59KVxuXG4vLyBwZXJjZW50YWdlIGNvbXBsZXRlLCByZXByZXNlbnRlZCBhcyBhIG51bWJlciBiZXR3ZWVuIDAgYW5kIDFcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShUb3JyZW50LnByb3RvdHlwZSwgJ3Byb2dyZXNzJywge1xuICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gKHRoaXMucGFyc2VkVG9ycmVudCAmJiAodGhpcy5kb3dubG9hZGVkIC8gdGhpcy5wYXJzZWRUb3JyZW50Lmxlbmd0aCkpIHx8IDBcbiAgfVxufSlcblxuLy8gYnl0ZXMgZG93bmxvYWRlZCAobm90IG5lY2Vzc2FyaWx5IHZlcmlmaWVkKVxuT2JqZWN0LmRlZmluZVByb3BlcnR5KFRvcnJlbnQucHJvdG90eXBlLCAnZG93bmxvYWRlZCcsIHtcbiAgZ2V0OiBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuICh0aGlzLnN0b3JhZ2UgJiYgdGhpcy5zdG9yYWdlLmRvd25sb2FkZWQpIHx8IDBcbiAgfVxufSlcblxuLy8gYnl0ZXMgdXBsb2FkZWRcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShUb3JyZW50LnByb3RvdHlwZSwgJ3VwbG9hZGVkJywge1xuICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdGhpcy5zd2FybS51cGxvYWRlZFxuICB9XG59KVxuXG4vLyByYXRpbyBvZiBieXRlcyBkb3dubG9hZGVkIHRvIHVwbG9hZGVkXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoVG9ycmVudC5wcm90b3R5cGUsICdyYXRpbycsIHtcbiAgZ2V0OiBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuICh0aGlzLnVwbG9hZGVkICYmICh0aGlzLmRvd25sb2FkZWQgLyB0aGlzLnVwbG9hZGVkKSkgfHwgMFxuICB9XG59KVxuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoVG9ycmVudC5wcm90b3R5cGUsICdtYWduZXRVUkknLCB7XG4gIGdldDogZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiBwYXJzZVRvcnJlbnQudG9NYWduZXRVUkkodGhpcy5wYXJzZWRUb3JyZW50KVxuICB9XG59KVxuXG5Ub3JyZW50LnByb3RvdHlwZS5fb25Td2FybUxpc3RlbmluZyA9IGZ1bmN0aW9uIChwb3J0KSB7XG4gIHZhciBzZWxmID0gdGhpc1xuICBpZiAoc2VsZi5fZGVzdHJveWVkKSByZXR1cm5cblxuICBzZWxmLmNsaWVudC50b3JyZW50UG9ydCA9IHBvcnRcblxuICAvLyBiZWdpbiBkaXNjb3ZlcmluZyBwZWVycyB2aWEgdGhlIERIVCBhbmQgdHJhY2tlciBzZXJ2ZXJzXG4gIHNlbGYuZGlzY292ZXJ5ID0gbmV3IERpc2NvdmVyeSh7XG4gICAgYW5ub3VuY2U6IHNlbGYucGFyc2VkVG9ycmVudC5hbm5vdW5jZSxcbiAgICBkaHQ6IHNlbGYuY2xpZW50LmRodCxcbiAgICB0cmFja2VyOiBzZWxmLmNsaWVudC50cmFja2VyLFxuICAgIHBlZXJJZDogc2VsZi5jbGllbnQucGVlcklkLFxuICAgIHBvcnQ6IHBvcnQsXG4gICAgcnRjQ29uZmlnOiBzZWxmLmNsaWVudC5ydGNDb25maWdcbiAgfSlcbiAgc2VsZi5kaXNjb3Zlcnkuc2V0VG9ycmVudChzZWxmLmluZm9IYXNoKVxuICBzZWxmLmRpc2NvdmVyeS5vbigncGVlcicsIHNlbGYuYWRkUGVlci5iaW5kKHNlbGYpKVxuXG4gIC8vIGV4cG9zZSBkaXNjb3ZlcnkgZXZlbnRzXG4gIHJlZW1pdChzZWxmLmRpc2NvdmVyeSwgc2VsZiwgWydkaHRBbm5vdW5jZScsICd3YXJuaW5nJywgJ2Vycm9yJ10pXG5cbiAgLy8gaWYgZnVsbCBtZXRhZGF0YSB3YXMgaW5jbHVkZWQgaW4gaW5pdGlhbCB0b3JyZW50IGlkLCB1c2UgaXRcbiAgaWYgKHNlbGYucGFyc2VkVG9ycmVudC5pbmZvKSBzZWxmLl9vbk1ldGFkYXRhKHNlbGYucGFyc2VkVG9ycmVudClcblxuICBzZWxmLmVtaXQoJ2xpc3RlbmluZycsIHBvcnQpXG59XG5cbi8qKlxuICogQ2FsbGVkIHdoZW4gdGhlIG1ldGFkYXRhIGlzIHJlY2VpdmVkLlxuICovXG5Ub3JyZW50LnByb3RvdHlwZS5fb25NZXRhZGF0YSA9IGZ1bmN0aW9uIChtZXRhZGF0YSkge1xuICB2YXIgc2VsZiA9IHRoaXNcbiAgaWYgKHNlbGYubWV0YWRhdGEgfHwgc2VsZi5fZGVzdHJveWVkKSByZXR1cm5cbiAgZGVidWcoJ2dvdCBtZXRhZGF0YScpXG5cbiAgaWYgKG1ldGFkYXRhICYmIG1ldGFkYXRhLmluZm9IYXNoKSB7XG4gICAgLy8gYG1ldGFkYXRhYCBpcyBhIHBhcnNlZCB0b3JyZW50IChmcm9tIHBhcnNlLXRvcnJlbnQgbW9kdWxlKVxuICAgIHNlbGYubWV0YWRhdGEgPSBwYXJzZVRvcnJlbnQudG9Ub3JyZW50RmlsZShtZXRhZGF0YSlcbiAgICBzZWxmLnBhcnNlZFRvcnJlbnQgPSBtZXRhZGF0YVxuICB9IGVsc2Uge1xuICAgIHNlbGYubWV0YWRhdGEgPSBtZXRhZGF0YVxuICAgIHRyeSB7XG4gICAgICBzZWxmLnBhcnNlZFRvcnJlbnQgPSBwYXJzZVRvcnJlbnQoc2VsZi5tZXRhZGF0YSlcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIHJldHVybiBzZWxmLmVtaXQoJ2Vycm9yJywgZXJyKVxuICAgIH1cbiAgfVxuXG4gIC8vIHVwZGF0ZSBwcmVsaW1pbmFyeSB0b3JyZW50IG5hbWVcbiAgc2VsZi5uYW1lID0gc2VsZi5wYXJzZWRUb3JyZW50Lm5hbWVcblxuICAvLyB1cGRhdGUgZGlzY292ZXJ5IG1vZHVsZSB3aXRoIGZ1bGwgdG9ycmVudCBtZXRhZGF0YVxuICBzZWxmLmRpc2NvdmVyeS5zZXRUb3JyZW50KHNlbGYucGFyc2VkVG9ycmVudClcblxuICBzZWxmLnJhcml0eU1hcCA9IG5ldyBSYXJpdHlNYXAoc2VsZi5zd2FybSwgc2VsZi5wYXJzZWRUb3JyZW50LnBpZWNlcy5sZW5ndGgpXG5cbiAgc2VsZi5zdG9yYWdlID0gbmV3IHNlbGYuX3N0b3JhZ2VJbXBsKHNlbGYucGFyc2VkVG9ycmVudCwgc2VsZi5zdG9yYWdlT3B0cylcbiAgc2VsZi5zdG9yYWdlLm9uKCdwaWVjZScsIHNlbGYuX29uU3RvcmFnZVBpZWNlLmJpbmQoc2VsZikpXG4gIHNlbGYuc3RvcmFnZS5vbignZmlsZScsIGZ1bmN0aW9uIChmaWxlKSB7XG4gICAgc2VsZi5lbWl0KCdmaWxlJywgZmlsZSlcbiAgfSlcblxuICBzZWxmLl9yZXNlcnZhdGlvbnMgPSBzZWxmLnN0b3JhZ2UucGllY2VzLm1hcChmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIFtdXG4gIH0pXG5cbiAgc2VsZi5zdG9yYWdlLm9uKCdkb25lJywgZnVuY3Rpb24gKCkge1xuICAgIGlmIChzZWxmLmRpc2NvdmVyeS50cmFja2VyKVxuICAgICAgc2VsZi5kaXNjb3ZlcnkudHJhY2tlci5jb21wbGV0ZSgpXG5cbiAgICBkZWJ1ZygndG9ycmVudCAnICsgc2VsZi5pbmZvSGFzaCArICcgZG9uZScpXG4gICAgc2VsZi5lbWl0KCdkb25lJylcbiAgfSlcblxuICBzZWxmLnN0b3JhZ2Uub24oJ3NlbGVjdCcsIHNlbGYuc2VsZWN0LmJpbmQoc2VsZikpXG4gIHNlbGYuc3RvcmFnZS5vbignZGVzZWxlY3QnLCBzZWxmLmRlc2VsZWN0LmJpbmQoc2VsZikpXG4gIHNlbGYuc3RvcmFnZS5vbignY3JpdGljYWwnLCBzZWxmLmNyaXRpY2FsLmJpbmQoc2VsZikpXG5cbiAgc2VsZi5zdG9yYWdlLmZpbGVzLmZvckVhY2goZnVuY3Rpb24gKGZpbGUpIHtcbiAgICBzZWxmLmZpbGVzLnB1c2goZmlsZSlcbiAgfSlcblxuICBzZWxmLnN3YXJtLndpcmVzLmZvckVhY2goZnVuY3Rpb24gKHdpcmUpIHtcbiAgICAvLyBJZiB3ZSBkaWRuJ3QgaGF2ZSB0aGUgbWV0YWRhdGEgYXQgdGhlIHRpbWUgdXRfbWV0YWRhdGEgd2FzIGluaXRpYWxpemVkIGZvciB0aGlzXG4gICAgLy8gd2lyZSwgd2Ugc3RpbGwgd2FudCB0byBtYWtlIGl0IGF2YWlsYWJsZSB0byB0aGUgcGVlciBpbiBjYXNlIHRoZXkgcmVxdWVzdCBpdC5cbiAgICBpZiAod2lyZS51dF9tZXRhZGF0YSkgd2lyZS51dF9tZXRhZGF0YS5zZXRNZXRhZGF0YShzZWxmLm1ldGFkYXRhKVxuXG4gICAgc2VsZi5fb25XaXJlV2l0aE1ldGFkYXRhKHdpcmUpXG4gIH0pXG5cbiAgaWYgKHNlbGYudmVyaWZ5KSB7XG4gICAgcHJvY2Vzcy5uZXh0VGljayhmdW5jdGlvbiAoKSB7XG4gICAgICBkZWJ1ZygndmVyaWZ5aW5nIGV4aXN0aW5nIHRvcnJlbnQgZGF0YScpXG4gICAgICB2YXIgbnVtUGllY2VzID0gMFxuICAgICAgdmFyIG51bVZlcmlmaWVkID0gMFxuXG4gICAgICAvLyBUT0RPOiBtb3ZlIHN0b3JhZ2UgdmVyaWZpY2F0aW9uIHRvIHN0b3JhZ2UuanM/XG4gICAgICBwYXJhbGxlbChzZWxmLnN0b3JhZ2UucGllY2VzLm1hcChmdW5jdGlvbiAocGllY2UpIHtcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uIChjYikge1xuICAgICAgICAgIHNlbGYuc3RvcmFnZS5yZWFkKHBpZWNlLmluZGV4LCBmdW5jdGlvbiAoZXJyLCBidWZmZXIpIHtcbiAgICAgICAgICAgIG51bVBpZWNlcyArPSAxXG4gICAgICAgICAgICBzZWxmLmVtaXQoJ3ZlcmlmeWluZycsIHtcbiAgICAgICAgICAgICAgcGVyY2VudERvbmU6IDEwMCAqIG51bVBpZWNlcyAvIHNlbGYuc3RvcmFnZS5waWVjZXMubGVuZ3RoLFxuICAgICAgICAgICAgICBwZXJjZW50VmVyaWZpZWQ6IDEwMCAqIG51bVZlcmlmaWVkIC8gc2VsZi5zdG9yYWdlLnBpZWNlcy5sZW5ndGhcbiAgICAgICAgICAgIH0pXG5cbiAgICAgICAgICAgIGlmICghZXJyICYmIGJ1ZmZlcikge1xuICAgICAgICAgICAgICAvLyBUT0RPOiB0aGlzIGlzIGEgYml0IGhhY2t5OyBmaWd1cmUgb3V0IGEgY2xlYW5lciB3YXkgb2YgdmVyaWZ5aW5nIHRoZSBidWZmZXJcbiAgICAgICAgICAgICAgcGllY2UudmVyaWZ5KGJ1ZmZlcilcbiAgICAgICAgICAgICAgbnVtVmVyaWZpZWQgKz0gcGllY2UudmVyaWZpZWRcbiAgICAgICAgICAgICAgZGVidWcoJ3BpZWNlICcgKyAocGllY2UudmVyaWZpZWQgPyAndmVyaWZpZWQnIDogJ2ludmFsaWQnKSArICcgJyArIHBpZWNlLmluZGV4KVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gY29udGludWUgcmVnYXJkbGVzcyBvZiB3aGV0aGVyIHBpZWNlIHZlcmlmaWNhdGlvbiBmYWlsZWRcbiAgICAgICAgICAgIGNiKClcbiAgICAgICAgICB9LCB0cnVlKSAvLyBmb3JjZXMgb3ZlcnJpZGUgdG8gYWxsb3cgcmVhZGluZyBmcm9tIG5vbi12ZXJpZmllZCBwaWVjZXNcbiAgICAgICAgfVxuICAgICAgfSksIHNlbGYuX29uU3RvcmFnZS5iaW5kKHNlbGYpKVxuICAgIH0pXG4gIH0gZWxzZSB7XG4gICAgcHJvY2Vzcy5uZXh0VGljayhzZWxmLl9vblN0b3JhZ2UuYmluZChzZWxmKSlcbiAgfVxuXG4gIHByb2Nlc3MubmV4dFRpY2soZnVuY3Rpb24gKCkge1xuICAgIHNlbGYuZW1pdCgnbWV0YWRhdGEnKVxuICB9KVxufVxuXG4vKipcbiAqIERlc3Ryb3kgYW5kIGNsZWFudXAgdGhpcyB0b3JyZW50LlxuICovXG5Ub3JyZW50LnByb3RvdHlwZS5kZXN0cm95ID0gZnVuY3Rpb24gKGNiKSB7XG4gIHZhciBzZWxmID0gdGhpc1xuICBkZWJ1ZygnZGVzdHJveScpXG4gIHNlbGYuX2Rlc3Ryb3llZCA9IHRydWVcbiAgY2xlYXJJbnRlcnZhbChzZWxmLl9yZWNob2tlSW50ZXJ2YWxJZClcblxuICB2YXIgdGFza3MgPSBbXVxuICBpZiAoc2VsZi5zd2FybSkgdGFza3MucHVzaChmdW5jdGlvbiAoY2IpIHtcbiAgICBzZWxmLnN3YXJtLmRlc3Ryb3koY2IpXG4gIH0pXG4gIGlmIChzZWxmLmRpc2NvdmVyeSkgdGFza3MucHVzaChmdW5jdGlvbiAoY2IpIHtcbiAgICBzZWxmLmRpc2NvdmVyeS5zdG9wKGNiKVxuICB9KVxuICBpZiAoc2VsZi5zdG9yYWdlKSB0YXNrcy5wdXNoKGZ1bmN0aW9uIChjYikge1xuICAgIHNlbGYuc3RvcmFnZS5jbG9zZShjYilcbiAgfSlcbiAgcGFyYWxsZWwodGFza3MsIGNiKVxufVxuXG4vKipcbiAqIEFkZCBhIHBlZXIgdG8gdGhlIHN3YXJtXG4gKiBAcGFyYW0ge3N0cmluZ3xTaW1wbGVQZWVyfSBwZWVyXG4gKiBAcmV0dXJuIHtib29sZWFufSB0cnVlIGlmIHBlZXIgd2FzIGFkZGVkLCBmYWxzZSBpZiBwZWVyIHdhcyBibG9ja2VkXG4gKi9cblRvcnJlbnQucHJvdG90eXBlLmFkZFBlZXIgPSBmdW5jdGlvbiAocGVlcikge1xuICB2YXIgc2VsZiA9IHRoaXNcbiAgLy8gVE9ETzogZXh0cmFjdCBJUCBhZGRyZXNzIGZyb20gcGVlciBvYmplY3QgYW5kIGNoZWNrIGJsb2NrbGlzdFxuICBpZiAodHlwZW9mIHBlZXIgPT09ICdzdHJpbmcnXG4gICAgICAmJiBzZWxmLmNsaWVudC5ibG9ja2VkXG4gICAgICAmJiBzZWxmLmNsaWVudC5ibG9ja2VkLmNvbnRhaW5zKGFkZHJUb0lQUG9ydChwZWVyKVswXSkpIHtcbiAgICBzZWxmLm51bUJsb2NrZWRQZWVycyArPSAxXG4gICAgc2VsZi5lbWl0KCdibG9ja2VkLXBlZXInLCBwZWVyKVxuICAgIHJldHVybiBmYWxzZVxuICB9IGVsc2Uge1xuICAgIHNlbGYuZW1pdCgncGVlcicsIHBlZXIpXG4gICAgc2VsZi5zd2FybS5hZGRQZWVyKHBlZXIpXG4gICAgcmV0dXJuIHRydWVcbiAgfVxufVxuXG4vKipcbiAqIFNlbGVjdCBhIHJhbmdlIG9mIHBpZWNlcyB0byBwcmlvcml0aXplLlxuICpcbiAqIEBwYXJhbSB7bnVtYmVyfSAgICBzdGFydCAgICAgc3RhcnQgcGllY2UgaW5kZXggKGluY2x1c2l2ZSlcbiAqIEBwYXJhbSB7bnVtYmVyfSAgICBlbmQgICAgICAgZW5kIHBpZWNlIGluZGV4IChpbmNsdXNpdmUpXG4gKiBAcGFyYW0ge251bWJlcn0gICAgcHJpb3JpdHkgIHByaW9yaXR5IGFzc29jaWF0ZWQgd2l0aCB0aGlzIHNlbGVjdGlvblxuICogQHBhcmFtIHtmdW5jdGlvbn0gIG5vdGlmeSAgICBjYWxsYmFjayB3aGVuIHNlbGVjdGlvbiBpcyB1cGRhdGVkIHdpdGggbmV3IGRhdGFcbiAqL1xuVG9ycmVudC5wcm90b3R5cGUuc2VsZWN0ID0gZnVuY3Rpb24gKHN0YXJ0LCBlbmQsIHByaW9yaXR5LCBub3RpZnkpIHtcbiAgdmFyIHNlbGYgPSB0aGlzXG4gIGlmIChzdGFydCA+IGVuZCB8fCBzdGFydCA8IDAgfHwgZW5kID49IHNlbGYuc3RvcmFnZS5waWVjZXMubGVuZ3RoKVxuICAgIHRocm93IG5ldyBFcnJvcignaW52YWxpZCBzZWxlY3Rpb24gJywgc3RhcnQsICc6JywgZW5kKVxuICBwcmlvcml0eSA9IE51bWJlcihwcmlvcml0eSkgfHwgMFxuXG4gIGRlYnVnKCdzZWxlY3QgJXMtJXMgKHByaW9yaXR5ICVzKScsIHN0YXJ0LCBlbmQsIHByaW9yaXR5KVxuXG4gIHNlbGYuX3NlbGVjdGlvbnMucHVzaCh7XG4gICAgZnJvbTogc3RhcnQsXG4gICAgdG86IGVuZCxcbiAgICBvZmZzZXQ6IDAsXG4gICAgcHJpb3JpdHk6IHByaW9yaXR5LFxuICAgIG5vdGlmeTogbm90aWZ5IHx8IG5vb3BcbiAgfSlcblxuICBzZWxmLl9zZWxlY3Rpb25zLnNvcnQoZnVuY3Rpb24gKGEsIGIpIHtcbiAgICByZXR1cm4gYi5wcmlvcml0eSAtIGEucHJpb3JpdHlcbiAgfSlcblxuICBzZWxmLl91cGRhdGVTZWxlY3Rpb25zKClcbn1cblxuLyoqXG4gKiBEZXByaW9yaXRpemVzIGEgcmFuZ2Ugb2YgcHJldmlvdXNseSBzZWxlY3RlZCBwaWVjZXMuXG4gKlxuICogQHBhcmFtIHtudW1iZXJ9ICBzdGFydCAgICAgc3RhcnQgcGllY2UgaW5kZXggKGluY2x1c2l2ZSlcbiAqIEBwYXJhbSB7bnVtYmVyfSAgZW5kICAgICAgIGVuZCBwaWVjZSBpbmRleCAoaW5jbHVzaXZlKVxuICogQHBhcmFtIHtudW1iZXJ9ICBwcmlvcml0eSAgcHJpb3JpdHkgYXNzb2NpYXRlZCB3aXRoIHRoZSBzZWxlY3Rpb25cbiAqL1xuVG9ycmVudC5wcm90b3R5cGUuZGVzZWxlY3QgPSBmdW5jdGlvbiAoc3RhcnQsIGVuZCwgcHJpb3JpdHkpIHtcbiAgdmFyIHNlbGYgPSB0aGlzXG4gIHByaW9yaXR5ID0gTnVtYmVyKHByaW9yaXR5KSB8fCAwXG4gIGRlYnVnKCdkZXNlbGVjdCAlcy0lcyAocHJpb3JpdHkgJXMpJywgc3RhcnQsIGVuZCwgcHJpb3JpdHkpXG5cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBzZWxmLl9zZWxlY3Rpb25zLmxlbmd0aDsgKytpKSB7XG4gICAgdmFyIHMgPSBzZWxmLl9zZWxlY3Rpb25zW2ldXG4gICAgaWYgKHMuZnJvbSA9PT0gc3RhcnQgJiYgcy50byA9PT0gZW5kICYmIHMucHJpb3JpdHkgPT09IHByaW9yaXR5KSB7XG4gICAgICBzZWxmLl9zZWxlY3Rpb25zLnNwbGljZShpLS0sIDEpXG4gICAgICBicmVha1xuICAgIH1cbiAgfVxuXG4gIHNlbGYuX3VwZGF0ZVNlbGVjdGlvbnMoKVxufVxuXG4vKipcbiAqIE1hcmtzIGEgcmFuZ2Ugb2YgcGllY2VzIGFzIGNyaXRpY2FsIHByaW9yaXR5IHRvIGJlIGRvd25sb2FkZWQgQVNBUC5cbiAqXG4gKiBAcGFyYW0ge251bWJlcn0gIHN0YXJ0ICBzdGFydCBwaWVjZSBpbmRleCAoaW5jbHVzaXZlKVxuICogQHBhcmFtIHtudW1iZXJ9ICBlbmQgICAgZW5kIHBpZWNlIGluZGV4IChpbmNsdXNpdmUpXG4gKi9cblRvcnJlbnQucHJvdG90eXBlLmNyaXRpY2FsID0gZnVuY3Rpb24gKHN0YXJ0LCBlbmQpIHtcbiAgdmFyIHNlbGYgPSB0aGlzXG4gIGRlYnVnKCdjcml0aWNhbCAlcy0lcycsIHN0YXJ0LCBlbmQpXG5cbiAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDw9IGVuZDsgKytpKSB7XG4gICAgc2VsZi5fY3JpdGljYWxbaV0gPSB0cnVlXG4gIH1cblxuICBzZWxmLl91cGRhdGVTZWxlY3Rpb25zKClcbn1cblxuVG9ycmVudC5wcm90b3R5cGUuX29uV2lyZSA9IGZ1bmN0aW9uICh3aXJlKSB7XG4gIHZhciBzZWxmID0gdGhpc1xuXG4gIC8vIHVzZSB1dF9tZXRhZGF0YSBleHRlbnNpb25cbiAgd2lyZS51c2UodXRfbWV0YWRhdGEoc2VsZi5tZXRhZGF0YSkpXG5cbiAgaWYgKCFzZWxmLm1ldGFkYXRhKSB7XG4gICAgd2lyZS51dF9tZXRhZGF0YS5vbignbWV0YWRhdGEnLCBmdW5jdGlvbiAobWV0YWRhdGEpIHtcbiAgICAgIGRlYnVnKCdnb3QgbWV0YWRhdGEgdmlhIHV0X21ldGFkYXRhJylcbiAgICAgIHNlbGYuX29uTWV0YWRhdGEobWV0YWRhdGEpXG4gICAgfSlcbiAgICB3aXJlLnV0X21ldGFkYXRhLmZldGNoKClcbiAgfVxuXG4gIC8vIHVzZSB1dF9wZXggZXh0ZW5zaW9uXG4gIGlmICh0eXBlb2YgdXRfcGV4ID09PSAnZnVuY3Rpb24nKSB3aXJlLnVzZSh1dF9wZXgoKSlcblxuICAvLyB3aXJlLnV0X3BleC5zdGFydCgpIC8vIFRPRE8gdHdvLXdheSBjb21tdW5pY2F0aW9uXG4gIGlmICh3aXJlLnV0X3BleCkgd2lyZS51dF9wZXgub24oJ3BlZXInLCBmdW5jdGlvbiAocGVlcikge1xuICAgIGRlYnVnKCdnb3QgcGVlciB2aWEgdXRfcGV4ICcgKyBwZWVyKVxuICAgIHNlbGYuYWRkUGVlcihwZWVyKVxuICB9KVxuXG4gIGlmICh3aXJlLnV0X3BleCkgd2lyZS51dF9wZXgub24oJ2Ryb3BwZWQnLCBmdW5jdGlvbiAocGVlcikge1xuICAgIC8vIHRoZSByZW1vdGUgcGVlciBiZWxpZXZlcyBhIGdpdmVuIHBlZXIgaGFzIGJlZW4gZHJvcHBlZCBmcm9tIHRoZSBzd2FybS5cbiAgICAvLyBpZiB3ZSdyZSBub3QgY3VycmVudGx5IGNvbm5lY3RlZCB0byBpdCwgdGhlbiByZW1vdmUgaXQgZnJvbSB0aGUgc3dhcm0ncyBxdWV1ZS5cbiAgICBpZiAoIShwZWVyIGluIHNlbGYuc3dhcm0uX3BlZXJzKSkgc2VsZi5zd2FybS5yZW1vdmVQZWVyKHBlZXIpXG4gIH0pXG5cbiAgLy8gU2VuZCBLRUVQLUFMSVZFIChldmVyeSA2MHMpIHNvIHBlZXJzIHdpbGwgbm90IGRpc2Nvbm5lY3QgdGhlIHdpcmVcbiAgd2lyZS5zZXRLZWVwQWxpdmUodHJ1ZSlcblxuICAvLyBJZiBwZWVyIHN1cHBvcnRzIERIVCwgc2VuZCBQT1JUIG1lc3NhZ2UgdG8gcmVwb3J0IERIVCBub2RlIGxpc3RlbmluZyBwb3J0XG4gIGlmICh3aXJlLnBlZXJFeHRlbnNpb25zLmRodCAmJiBzZWxmLmNsaWVudC5kaHQgJiYgc2VsZi5jbGllbnQuZGh0Lmxpc3RlbmluZykge1xuICAgIHdpcmUucG9ydChzZWxmLmNsaWVudC5kaHQuYWRkcmVzcygpLnBvcnQpXG4gIH1cblxuICAvLyBXaGVuIHBlZXIgc2VuZHMgUE9SVCwgYWRkIHRoZW0gdG8gdGhlIHJvdXRpbmcgdGFibGVcbiAgd2lyZS5vbigncG9ydCcsIGZ1bmN0aW9uIChwb3J0KSB7XG4gICAgZGVidWcoJ3BvcnQgJXMgbWVzc2FnZSBmcm9tICVzJywgcG9ydCwgd2lyZS5yZW1vdGVBZGRyZXNzKVxuICAgIC8vIFRPRE86IGRodCBzaG91bGQgc3VwcG9ydCBhZGRpbmcgYSBub2RlIHdoZW4geW91IGRvbid0IGtub3cgdGhlIG5vZGVJZFxuICAgIC8vIGRodC5hZGROb2RlKHdpcmUucmVtb3RlQWRkcmVzcyArICc6JyArIHBvcnQpXG4gIH0pXG5cbiAgd2lyZS5vbigndGltZW91dCcsIGZ1bmN0aW9uICgpIHtcbiAgICBkZWJ1Zygnd2lyZSB0aW1lb3V0IGZyb20gJyArIHdpcmUucmVtb3RlQWRkcmVzcylcbiAgICAvLyBUT0RPOiB0aGlzIG1pZ2h0IGJlIGRlc3Ryb3lpbmcgd2lyZXMgdG9vIGVhZ2VybHlcbiAgICB3aXJlLmRlc3Ryb3koKVxuICB9KVxuXG4gIC8vIFRpbWVvdXQgZm9yIHBpZWNlIHJlcXVlc3RzIHRvIHRoaXMgcGVlclxuICB3aXJlLnNldFRpbWVvdXQoc2VsZi5waWVjZVRpbWVvdXQpXG5cbiAgaWYgKHNlbGYubWV0YWRhdGEpIHtcbiAgICBzZWxmLl9vbldpcmVXaXRoTWV0YWRhdGEod2lyZSlcbiAgfVxufVxuXG5Ub3JyZW50LnByb3RvdHlwZS5fb25XaXJlV2l0aE1ldGFkYXRhID0gZnVuY3Rpb24gKHdpcmUpIHtcbiAgdmFyIHNlbGYgPSB0aGlzXG4gIHZhciB0aW1lb3V0SWQgPSBudWxsXG4gIHZhciB0aW1lb3V0TXMgPSBzZWxmLmNob2tlVGltZW91dFxuXG4gIGZ1bmN0aW9uIG9uQ2hva2VUaW1lb3V0ICgpIHtcbiAgICBpZiAoc2VsZi5fZGVzdHJveWVkIHx8IHdpcmUuX2Rlc3Ryb3llZCkgcmV0dXJuXG5cbiAgICBpZiAoc2VsZi5zd2FybS5udW1RdWV1ZWQgPiAyICogKHNlbGYuc3dhcm0ubnVtQ29ubnMgLSBzZWxmLnN3YXJtLm51bVBlZXJzKSAmJlxuICAgICAgd2lyZS5hbUludGVyZXN0ZWQpIHtcbiAgICAgIHdpcmUuZGVzdHJveSgpXG4gICAgfSBlbHNlIHtcbiAgICAgIHRpbWVvdXRJZCA9IHNldFRpbWVvdXQob25DaG9rZVRpbWVvdXQsIHRpbWVvdXRNcylcbiAgICB9XG4gIH1cblxuICB2YXIgaSA9IDBcbiAgZnVuY3Rpb24gdXBkYXRlU2VlZFN0YXR1cyAoKSB7XG4gICAgaWYgKHdpcmUucGVlclBpZWNlcy5sZW5ndGggIT09IHNlbGYuc3RvcmFnZS5waWVjZXMubGVuZ3RoKSByZXR1cm5cbiAgICBmb3IgKDsgaSA8IHNlbGYuc3RvcmFnZS5waWVjZXMubGVuZ3RoOyArK2kpIHtcbiAgICAgIGlmICghd2lyZS5wZWVyUGllY2VzLmdldChpKSkgcmV0dXJuXG4gICAgfVxuICAgIHdpcmUuaXNTZWVkZXIgPSB0cnVlXG4gICAgd2lyZS5jaG9rZSgpIC8vIGFsd2F5cyBjaG9rZSBzZWVkZXJzXG4gIH1cblxuICB3aXJlLm9uKCdiaXRmaWVsZCcsIGZ1bmN0aW9uICgpIHtcbiAgICB1cGRhdGVTZWVkU3RhdHVzKClcbiAgICBzZWxmLl91cGRhdGUoKVxuICB9KVxuXG4gIHdpcmUub24oJ2hhdmUnLCBmdW5jdGlvbiAoKSB7XG4gICAgdXBkYXRlU2VlZFN0YXR1cygpXG4gICAgc2VsZi5fdXBkYXRlKClcbiAgfSlcblxuICB3aXJlLm9uY2UoJ2ludGVyZXN0ZWQnLCBmdW5jdGlvbiAoKSB7XG4gICAgd2lyZS51bmNob2tlKClcbiAgfSlcblxuICB3aXJlLm9uKCdjbG9zZScsIGZ1bmN0aW9uICgpIHtcbiAgICBjbGVhclRpbWVvdXQodGltZW91dElkKVxuICB9KVxuXG4gIHdpcmUub24oJ2Nob2tlJywgZnVuY3Rpb24gKCkge1xuICAgIGNsZWFyVGltZW91dCh0aW1lb3V0SWQpXG4gICAgdGltZW91dElkID0gc2V0VGltZW91dChvbkNob2tlVGltZW91dCwgdGltZW91dE1zKVxuICB9KVxuXG4gIHdpcmUub24oJ3VuY2hva2UnLCBmdW5jdGlvbiAoKSB7XG4gICAgY2xlYXJUaW1lb3V0KHRpbWVvdXRJZClcbiAgICBzZWxmLl91cGRhdGUoKVxuICB9KVxuXG4gIHdpcmUub24oJ3JlcXVlc3QnLCBmdW5jdGlvbiAoaW5kZXgsIG9mZnNldCwgbGVuZ3RoLCBjYikge1xuICAgIC8vIERpc2Nvbm5lY3QgZnJvbSBwZWVycyB0aGF0IHJlcXVlc3QgbW9yZSB0aGFuIDEyOEtCLCBwZXIgc3BlY1xuICAgIGlmIChsZW5ndGggPiBNQVhfQkxPQ0tfTEVOR1RIKSB7XG4gICAgICBkZWJ1Zyh3aXJlLnJlbW90ZUFkZHJlc3MsICdyZXF1ZXN0ZWQgaW52YWxpZCBibG9jayBzaXplJywgbGVuZ3RoKVxuICAgICAgcmV0dXJuIHdpcmUuZGVzdHJveSgpXG4gICAgfVxuXG4gICAgc2VsZi5zdG9yYWdlLnJlYWRCbG9jayhpbmRleCwgb2Zmc2V0LCBsZW5ndGgsIGNiKVxuICB9KVxuXG4gIHdpcmUuYml0ZmllbGQoc2VsZi5zdG9yYWdlLmJpdGZpZWxkKSAvLyBhbHdheXMgc2VuZCBiaXRmaWVsZCAocmVxdWlyZWQpXG4gIHdpcmUuaW50ZXJlc3RlZCgpIC8vIGFsd2F5cyBzdGFydCBvdXQgaW50ZXJlc3RlZFxuXG4gIHRpbWVvdXRJZCA9IHNldFRpbWVvdXQob25DaG9rZVRpbWVvdXQsIHRpbWVvdXRNcylcblxuICB3aXJlLmlzU2VlZGVyID0gZmFsc2VcbiAgdXBkYXRlU2VlZFN0YXR1cygpXG59XG5cbi8qKlxuICogQ2FsbGVkIHdoZW4gdGhlIG1ldGFkYXRhLCBzd2FybSwgYW5kIHVuZGVybHlpbmcgc3RvcmFnZSBhcmUgYWxsIGZ1bGx5IGluaXRpYWxpemVkLlxuICovXG5Ub3JyZW50LnByb3RvdHlwZS5fb25TdG9yYWdlID0gZnVuY3Rpb24gKCkge1xuICB2YXIgc2VsZiA9IHRoaXNcbiAgaWYgKHNlbGYuX2Rlc3Ryb3llZCkgcmV0dXJuXG4gIGRlYnVnKCdvbiBzdG9yYWdlJylcblxuICAvLyBhbGxvdyB3cml0ZXMgdG8gc3RvcmFnZSBvbmx5IGFmdGVyIGluaXRpYWwgcGllY2UgdmVyaWZpY2F0aW9uIGlzIGZpbmlzaGVkXG4gIHNlbGYuc3RvcmFnZS5yZWFkb25seSA9IGZhbHNlXG5cbiAgLy8gc3RhcnQgb2ZmIHNlbGVjdGluZyB0aGUgZW50aXJlIHRvcnJlbnQgd2l0aCBsb3cgcHJpb3JpdHlcbiAgc2VsZi5zZWxlY3QoMCwgc2VsZi5zdG9yYWdlLnBpZWNlcy5sZW5ndGggLSAxLCBmYWxzZSlcblxuICBzZWxmLl9yZWNob2tlSW50ZXJ2YWxJZCA9IHNldEludGVydmFsKHNlbGYuX3JlY2hva2UuYmluZChzZWxmKSwgUkVDSE9LRV9JTlRFUlZBTClcbiAgaWYgKHNlbGYuX3JlY2hva2VJbnRlcnZhbElkLnVucmVmKSBzZWxmLl9yZWNob2tlSW50ZXJ2YWxJZC51bnJlZigpXG5cbiAgcHJvY2Vzcy5uZXh0VGljayhmdW5jdGlvbiAoKSB7XG4gICAgc2VsZi5yZWFkeSA9IHRydWVcbiAgICBzZWxmLmVtaXQoJ3JlYWR5JylcbiAgfSlcbn1cblxuLyoqXG4gKiBXaGVuIGEgcGllY2UgaXMgZnVsbHkgZG93bmxvYWRlZCwgbm90aWZ5IGFsbCBwZWVycyB3aXRoIGEgSEFWRSBtZXNzYWdlLlxuICogQHBhcmFtIHtQaWVjZX0gcGllY2VcbiAqL1xuVG9ycmVudC5wcm90b3R5cGUuX29uU3RvcmFnZVBpZWNlID0gZnVuY3Rpb24gKHBpZWNlKSB7XG4gIHZhciBzZWxmID0gdGhpc1xuICBkZWJ1ZygncGllY2UgZG9uZSAlcycsIHBpZWNlLmluZGV4KVxuICBzZWxmLl9yZXNlcnZhdGlvbnNbcGllY2UuaW5kZXhdID0gbnVsbFxuXG4gIHNlbGYuc3dhcm0ud2lyZXMuZm9yRWFjaChmdW5jdGlvbiAod2lyZSkge1xuICAgIHdpcmUuaGF2ZShwaWVjZS5pbmRleClcbiAgfSlcblxuICBzZWxmLl9nY1NlbGVjdGlvbnMoKVxufVxuXG4vKipcbiAqIENhbGxlZCBvbiBzZWxlY3Rpb24gY2hhbmdlcy5cbiAqL1xuVG9ycmVudC5wcm90b3R5cGUuX3VwZGF0ZVNlbGVjdGlvbnMgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBzZWxmID0gdGhpc1xuICBpZiAoIXNlbGYuc3dhcm0gfHwgc2VsZi5fZGVzdHJveWVkKSByZXR1cm5cbiAgaWYgKCFzZWxmLm1ldGFkYXRhKSByZXR1cm4gc2VsZi5vbmNlKCdtZXRhZGF0YScsIHNlbGYuX3VwZGF0ZVNlbGVjdGlvbnMuYmluZChzZWxmKSlcblxuICBwcm9jZXNzLm5leHRUaWNrKHNlbGYuX2djU2VsZWN0aW9ucy5iaW5kKHNlbGYpKVxuICBzZWxmLl91cGRhdGVJbnRlcmVzdCgpXG4gIHNlbGYuX3VwZGF0ZSgpXG59XG5cbi8qKlxuICogR2FyYmFnZSBjb2xsZWN0IHNlbGVjdGlvbnMgd2l0aCByZXNwZWN0IHRvIHRoZSBzdG9yYWdlJ3MgY3VycmVudCBzdGF0ZS5cbiAqL1xuVG9ycmVudC5wcm90b3R5cGUuX2djU2VsZWN0aW9ucyA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIHNlbGYgPSB0aGlzXG5cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBzZWxmLl9zZWxlY3Rpb25zLmxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIHMgPSBzZWxmLl9zZWxlY3Rpb25zW2ldXG4gICAgdmFyIG9sZE9mZnNldCA9IHMub2Zmc2V0XG5cbiAgICAvLyBjaGVjayBmb3IgbmV3bHkgZG93bmxvYWRlZCBwaWVjZXMgaW4gc2VsZWN0aW9uXG4gICAgd2hpbGUgKHNlbGYuc3RvcmFnZS5iaXRmaWVsZC5nZXQocy5mcm9tICsgcy5vZmZzZXQpICYmIHMuZnJvbSArIHMub2Zmc2V0IDwgcy50bykge1xuICAgICAgcy5vZmZzZXQrK1xuICAgIH1cblxuICAgIGlmIChvbGRPZmZzZXQgIT09IHMub2Zmc2V0KSBzLm5vdGlmeSgpXG4gICAgaWYgKHMudG8gIT09IHMuZnJvbSArIHMub2Zmc2V0KSBjb250aW51ZVxuICAgIGlmICghc2VsZi5zdG9yYWdlLmJpdGZpZWxkLmdldChzLmZyb20gKyBzLm9mZnNldCkpIGNvbnRpbnVlXG5cbiAgICAvLyByZW1vdmUgZnVsbHkgZG93bmxvYWRlZCBzZWxlY3Rpb25cbiAgICBzZWxmLl9zZWxlY3Rpb25zLnNwbGljZShpLS0sIDEpIC8vIGRlY3JlbWVudCBpIHRvIG9mZnNldCBzcGxpY2VcbiAgICBzLm5vdGlmeSgpIC8vIFRPRE86IHRoaXMgbWF5IG5vdGlmeSB0d2ljZSBpbiBhIHJvdy4gaXMgdGhpcyBhIHByb2JsZW0/XG4gICAgc2VsZi5fdXBkYXRlSW50ZXJlc3QoKVxuICB9XG5cbiAgaWYgKCFzZWxmLl9zZWxlY3Rpb25zLmxlbmd0aCkgc2VsZi5lbWl0KCdpZGxlJylcbn1cblxuLyoqXG4gKiBVcGRhdGUgaW50ZXJlc3RlZCBzdGF0dXMgZm9yIGFsbCBwZWVycy5cbiAqL1xuVG9ycmVudC5wcm90b3R5cGUuX3VwZGF0ZUludGVyZXN0ID0gZnVuY3Rpb24gKCkge1xuICB2YXIgc2VsZiA9IHRoaXNcblxuICB2YXIgcHJldiA9IHNlbGYuX2FtSW50ZXJlc3RlZFxuICBzZWxmLl9hbUludGVyZXN0ZWQgPSAhIXNlbGYuX3NlbGVjdGlvbnMubGVuZ3RoXG5cbiAgc2VsZi5zd2FybS53aXJlcy5mb3JFYWNoKGZ1bmN0aW9uICh3aXJlKSB7XG4gICAgLy8gVE9ETzogb25seSBjYWxsIHdpcmUuaW50ZXJlc3RlZCBpZiB0aGUgd2lyZSBoYXMgYXQgbGVhc3Qgb25lIHBpZWNlIHdlIG5lZWRcbiAgICBpZiAoc2VsZi5fYW1JbnRlcmVzdGVkKSB3aXJlLmludGVyZXN0ZWQoKVxuICAgIGVsc2Ugd2lyZS51bmludGVyZXN0ZWQoKVxuICB9KVxuXG4gIGlmIChwcmV2ID09PSBzZWxmLl9hbUludGVyZXN0ZWQpIHJldHVyblxuICBpZiAoc2VsZi5fYW1JbnRlcmVzdGVkKSBzZWxmLmVtaXQoJ2ludGVyZXN0ZWQnKVxuICBlbHNlIHNlbGYuZW1pdCgndW5pbnRlcmVzdGVkJylcbn1cblxuLyoqXG4gKiBIZWFydGJlYXQgdG8gdXBkYXRlIGFsbCBwZWVycyBhbmQgdGhlaXIgcmVxdWVzdHMuXG4gKi9cblRvcnJlbnQucHJvdG90eXBlLl91cGRhdGUgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBzZWxmID0gdGhpc1xuICBpZiAoc2VsZi5fZGVzdHJveWVkKSByZXR1cm5cblxuICAvLyB1cGRhdGUgd2lyZXMgaW4gcmFuZG9tIG9yZGVyIGZvciBiZXR0ZXIgcmVxdWVzdCBkaXN0cmlidXRpb25cbiAgcmFuZG9taXplZEZvckVhY2goc2VsZi5zd2FybS53aXJlcywgc2VsZi5fdXBkYXRlV2lyZS5iaW5kKHNlbGYpKVxufVxuXG4vKipcbiAqIEF0dGVtcHRzIHRvIHVwZGF0ZSBhIHBlZXIncyByZXF1ZXN0c1xuICovXG5Ub3JyZW50LnByb3RvdHlwZS5fdXBkYXRlV2lyZSA9IGZ1bmN0aW9uICh3aXJlKSB7XG4gIHZhciBzZWxmID0gdGhpc1xuXG4gIGlmICh3aXJlLnBlZXJDaG9raW5nKSByZXR1cm5cbiAgaWYgKCF3aXJlLmRvd25sb2FkZWQpIHJldHVybiB2YWxpZGF0ZVdpcmUoKVxuXG4gIHZhciBtaW5PdXRzdGFuZGluZ1JlcXVlc3RzID0gZ2V0UGlwZWxpbmVMZW5ndGgod2lyZSwgUElQRUxJTkVfTUlOX0RVUkFUSU9OKVxuICBpZiAod2lyZS5yZXF1ZXN0cy5sZW5ndGggPj0gbWluT3V0c3RhbmRpbmdSZXF1ZXN0cykgcmV0dXJuXG4gIHZhciBtYXhPdXRzdGFuZGluZ1JlcXVlc3RzID0gZ2V0UGlwZWxpbmVMZW5ndGgod2lyZSwgUElQRUxJTkVfTUFYX0RVUkFUSU9OKVxuXG4gIHRyeVNlbGVjdFdpcmUoZmFsc2UpIHx8IHRyeVNlbGVjdFdpcmUodHJ1ZSlcblxuICBmdW5jdGlvbiBnZW5QaWVjZUZpbHRlckZ1bmMgKHN0YXJ0LCBlbmQsIHRyaWVkLCByYW5rKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uIChpKSB7XG4gICAgICByZXR1cm4gaSA+PSBzdGFydCAmJiBpIDw9IGVuZCAmJiAhKGkgaW4gdHJpZWQpICYmIHdpcmUucGVlclBpZWNlcy5nZXQoaSkgJiYgKCFyYW5rIHx8IHJhbmsoaSkpXG4gICAgfVxuICB9XG5cbiAgLy8gVE9ETzogRG8gd2UgbmVlZCBib3RoIHZhbGlkYXRlV2lyZSBhbmQgdHJ5U2VsZWN0V2lyZT9cbiAgZnVuY3Rpb24gdmFsaWRhdGVXaXJlICgpIHtcbiAgICBpZiAod2lyZS5yZXF1ZXN0cy5sZW5ndGgpIHJldHVyblxuXG4gICAgZm9yICh2YXIgaSA9IHNlbGYuX3NlbGVjdGlvbnMubGVuZ3RoOyBpLS07KSB7XG4gICAgICB2YXIgbmV4dCA9IHNlbGYuX3NlbGVjdGlvbnNbaV1cblxuICAgICAgdmFyIHBpZWNlXG4gICAgICBpZiAoc2VsZi5zdHJhdGVneSA9PT0gJ3JhcmVzdCcpIHtcbiAgICAgICAgdmFyIHN0YXJ0ID0gbmV4dC5mcm9tICsgbmV4dC5vZmZzZXRcbiAgICAgICAgdmFyIGVuZCA9IG5leHQudG9cbiAgICAgICAgdmFyIGxlbiA9IGVuZCAtIHN0YXJ0ICsgMVxuICAgICAgICB2YXIgdHJpZWQgPSB7fVxuICAgICAgICB2YXIgdHJpZXMgPSAwXG4gICAgICAgIHZhciBmaWx0ZXIgPSBnZW5QaWVjZUZpbHRlckZ1bmMoc3RhcnQsIGVuZCwgdHJpZWQpXG5cbiAgICAgICAgd2hpbGUgKHRyaWVzIDwgbGVuKSB7XG4gICAgICAgICAgcGllY2UgPSBzZWxmLnJhcml0eU1hcC5nZXRSYXJlc3RQaWVjZShmaWx0ZXIpXG4gICAgICAgICAgaWYgKHBpZWNlIDwgMCkgYnJlYWtcbiAgICAgICAgICBpZiAoc2VsZi5fcmVxdWVzdCh3aXJlLCBwaWVjZSwgZmFsc2UpKSByZXR1cm5cbiAgICAgICAgICB0cmllZFtwaWVjZV0gPSB0cnVlXG4gICAgICAgICAgdHJpZXMgKz0gMVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBmb3IgKHBpZWNlID0gbmV4dC50bzsgcGllY2UgPj0gbmV4dC5mcm9tICsgbmV4dC5vZmZzZXQ7IC0tcGllY2UpIHtcbiAgICAgICAgICBpZiAoIXdpcmUucGVlclBpZWNlcy5nZXQocGllY2UpKSBjb250aW51ZVxuICAgICAgICAgIGlmIChzZWxmLl9yZXF1ZXN0KHdpcmUsIHBpZWNlLCBmYWxzZSkpIHJldHVyblxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gVE9ETzogd2lyZSBmYWlsZWQgdG8gdmFsaWRhdGUgYXMgdXNlZnVsOyBzaG91bGQgd2UgY2xvc2UgaXQ/XG4gIH1cblxuICBmdW5jdGlvbiBzcGVlZFJhbmtlciAoKSB7XG4gICAgdmFyIHNwZWVkID0gd2lyZS5kb3dubG9hZFNwZWVkKCkgfHwgMVxuICAgIGlmIChzcGVlZCA+IFNQRUVEX1RIUkVTSE9MRCkgcmV0dXJuIGZ1bmN0aW9uICgpIHsgcmV0dXJuIHRydWUgfVxuXG4gICAgdmFyIHNlY3MgPSBNYXRoLm1heCgxLCB3aXJlLnJlcXVlc3RzLmxlbmd0aCkgKiBTdG9yYWdlLkJMT0NLX0xFTkdUSCAvIHNwZWVkXG4gICAgdmFyIHRyaWVzID0gMTBcbiAgICB2YXIgcHRyID0gMFxuXG4gICAgcmV0dXJuIGZ1bmN0aW9uIChpbmRleCkge1xuICAgICAgaWYgKCF0cmllcyB8fCBzZWxmLnN0b3JhZ2UuYml0ZmllbGQuZ2V0KGluZGV4KSkgcmV0dXJuIHRydWVcblxuICAgICAgdmFyIHBpZWNlID0gc2VsZi5zdG9yYWdlLnBpZWNlc1tpbmRleF1cbiAgICAgIHZhciBtaXNzaW5nID0gcGllY2UuYmxvY2tzLmxlbmd0aCAtIHBpZWNlLmJsb2Nrc1dyaXR0ZW5cblxuICAgICAgZm9yICg7IHB0ciA8IHNlbGYuc3dhcm0ud2lyZXMubGVuZ3RoOyBwdHIrKykge1xuICAgICAgICB2YXIgb3RoZXJXaXJlID0gc2VsZi5zd2FybS53aXJlc1twdHJdXG4gICAgICAgIHZhciBvdGhlclNwZWVkID0gb3RoZXJXaXJlLmRvd25sb2FkU3BlZWQoKVxuXG4gICAgICAgIGlmIChvdGhlclNwZWVkIDwgU1BFRURfVEhSRVNIT0xEKSBjb250aW51ZVxuICAgICAgICBpZiAob3RoZXJTcGVlZCA8PSBzcGVlZCkgY29udGludWVcbiAgICAgICAgaWYgKCFvdGhlcldpcmUucGVlclBpZWNlcy5nZXQoaW5kZXgpKSBjb250aW51ZVxuICAgICAgICBpZiAoKG1pc3NpbmcgLT0gb3RoZXJTcGVlZCAqIHNlY3MpID4gMCkgY29udGludWVcblxuICAgICAgICB0cmllcy0tXG4gICAgICAgIHJldHVybiBmYWxzZVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gdHJ1ZVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHNodWZmbGVQcmlvcml0eSAoaSkge1xuICAgIHZhciBsYXN0ID0gaVxuICAgIGZvciAodmFyIGogPSBpOyBqIDwgc2VsZi5fc2VsZWN0aW9ucy5sZW5ndGggJiYgc2VsZi5fc2VsZWN0aW9uc1tqXS5wcmlvcml0eTsgaisrKSB7XG4gICAgICBsYXN0ID0galxuICAgIH1cbiAgICB2YXIgdG1wID0gc2VsZi5fc2VsZWN0aW9uc1tpXVxuICAgIHNlbGYuX3NlbGVjdGlvbnNbaV0gPSBzZWxmLl9zZWxlY3Rpb25zW2xhc3RdXG4gICAgc2VsZi5fc2VsZWN0aW9uc1tsYXN0XSA9IHRtcFxuICB9XG5cbiAgZnVuY3Rpb24gdHJ5U2VsZWN0V2lyZSAoaG90c3dhcCkge1xuICAgIGlmICh3aXJlLnJlcXVlc3RzLmxlbmd0aCA+PSBtYXhPdXRzdGFuZGluZ1JlcXVlc3RzKSByZXR1cm4gdHJ1ZVxuICAgIHZhciByYW5rID0gc3BlZWRSYW5rZXIoKVxuXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBzZWxmLl9zZWxlY3Rpb25zLmxlbmd0aDsgaSsrKSB7XG4gICAgICB2YXIgbmV4dCA9IHNlbGYuX3NlbGVjdGlvbnNbaV1cblxuICAgICAgdmFyIHBpZWNlXG4gICAgICBpZiAoc2VsZi5zdHJhdGVneSA9PT0gJ3JhcmVzdCcpIHtcbiAgICAgICAgdmFyIHN0YXJ0ID0gbmV4dC5mcm9tICsgbmV4dC5vZmZzZXRcbiAgICAgICAgdmFyIGVuZCA9IG5leHQudG9cbiAgICAgICAgdmFyIGxlbiA9IGVuZCAtIHN0YXJ0ICsgMVxuICAgICAgICB2YXIgdHJpZWQgPSB7fVxuICAgICAgICB2YXIgdHJpZXMgPSAwXG4gICAgICAgIHZhciBmaWx0ZXIgPSBnZW5QaWVjZUZpbHRlckZ1bmMoc3RhcnQsIGVuZCwgdHJpZWQsIHJhbmspXG5cbiAgICAgICAgd2hpbGUgKHRyaWVzIDwgbGVuKSB7XG4gICAgICAgICAgcGllY2UgPSBzZWxmLnJhcml0eU1hcC5nZXRSYXJlc3RQaWVjZShmaWx0ZXIpXG4gICAgICAgICAgaWYgKHBpZWNlIDwgMCkgYnJlYWtcblxuICAgICAgICAgIC8vIHJlcXVlc3QgYWxsIG5vbi1yZXNlcnZlZCBibG9ja3MgaW4gdGhpcyBwaWVjZVxuICAgICAgICAgIHdoaWxlIChzZWxmLl9yZXF1ZXN0KHdpcmUsIHBpZWNlLCBzZWxmLl9jcml0aWNhbFtwaWVjZV0gfHwgaG90c3dhcCkpIHt9XG5cbiAgICAgICAgICBpZiAod2lyZS5yZXF1ZXN0cy5sZW5ndGggPCBtYXhPdXRzdGFuZGluZ1JlcXVlc3RzKSB7XG4gICAgICAgICAgICB0cmllZFtwaWVjZV0gPSB0cnVlXG4gICAgICAgICAgICB0cmllcysrXG4gICAgICAgICAgICBjb250aW51ZVxuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChuZXh0LnByaW9yaXR5KSBzaHVmZmxlUHJpb3JpdHkoaSlcbiAgICAgICAgICByZXR1cm4gdHJ1ZVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBmb3IgKHBpZWNlID0gbmV4dC5mcm9tICsgbmV4dC5vZmZzZXQ7IHBpZWNlIDw9IG5leHQudG87IHBpZWNlKyspIHtcbiAgICAgICAgICBpZiAoIXdpcmUucGVlclBpZWNlcy5nZXQocGllY2UpIHx8ICFyYW5rKHBpZWNlKSkgY29udGludWVcblxuICAgICAgICAgIC8vIHJlcXVlc3QgYWxsIG5vbi1yZXNlcnZlZCBibG9ja3MgaW4gcGllY2VcbiAgICAgICAgICB3aGlsZSAoc2VsZi5fcmVxdWVzdCh3aXJlLCBwaWVjZSwgc2VsZi5fY3JpdGljYWxbcGllY2VdIHx8IGhvdHN3YXApKSB7fVxuXG4gICAgICAgICAgaWYgKHdpcmUucmVxdWVzdHMubGVuZ3RoIDwgbWF4T3V0c3RhbmRpbmdSZXF1ZXN0cykgY29udGludWVcblxuICAgICAgICAgIGlmIChuZXh0LnByaW9yaXR5KSBzaHVmZmxlUHJpb3JpdHkoaSlcbiAgICAgICAgICByZXR1cm4gdHJ1ZVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGZhbHNlXG4gIH1cbn1cblxuLyoqXG4gKiBDYWxsZWQgcGVyaW9kaWNhbGx5IHRvIHVwZGF0ZSB0aGUgY2hva2VkIHN0YXR1cyBvZiBhbGwgcGVlcnMsIGhhbmRsaW5nIG9wdGltaXN0aWNcbiAqIHVuY2hva2luZyBhcyBkZXNjcmliZWQgaW4gQkVQMy5cbiAqL1xuVG9ycmVudC5wcm90b3R5cGUuX3JlY2hva2UgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBzZWxmID0gdGhpc1xuXG4gIGlmIChzZWxmLl9yZWNob2tlT3B0aW1pc3RpY1RpbWUgPiAwKVxuICAgIHNlbGYuX3JlY2hva2VPcHRpbWlzdGljVGltZSAtPSAxXG4gIGVsc2VcbiAgICBzZWxmLl9yZWNob2tlT3B0aW1pc3RpY1dpcmUgPSBudWxsXG5cbiAgdmFyIHBlZXJzID0gW11cblxuICBzZWxmLnN3YXJtLndpcmVzLmZvckVhY2goZnVuY3Rpb24gKHdpcmUpIHtcbiAgICBpZiAoIXdpcmUuaXNTZWVkZXIgJiYgd2lyZSAhPT0gc2VsZi5fcmVjaG9rZU9wdGltaXN0aWNXaXJlKSB7XG4gICAgICBwZWVycy5wdXNoKHtcbiAgICAgICAgd2lyZTogd2lyZSxcbiAgICAgICAgZG93bmxvYWRTcGVlZDogd2lyZS5kb3dubG9hZFNwZWVkKCksXG4gICAgICAgIHVwbG9hZFNwZWVkOiB3aXJlLnVwbG9hZFNwZWVkKCksXG4gICAgICAgIHNhbHQ6IE1hdGgucmFuZG9tKCksXG4gICAgICAgIGlzQ2hva2VkOiB0cnVlXG4gICAgICB9KVxuICAgIH1cbiAgfSlcblxuICBwZWVycy5zb3J0KHJlY2hva2VTb3J0KVxuXG4gIHZhciB1bmNob2tlSW50ZXJlc3RlZCA9IDBcbiAgdmFyIGkgPSAwXG4gIGZvciAoOyBpIDwgcGVlcnMubGVuZ3RoICYmIHVuY2hva2VJbnRlcmVzdGVkIDwgc2VsZi5fcmVjaG9rZU51bVNsb3RzOyArK2kpIHtcbiAgICBwZWVyc1tpXS5pc0Nob2tlZCA9IGZhbHNlXG4gICAgaWYgKHBlZXJzW2ldLndpcmUucGVlckludGVyZXN0ZWQpIHVuY2hva2VJbnRlcmVzdGVkICs9IDFcbiAgfVxuXG4gIC8vIE9wdGltaXN0aWNhbGx5IHVuY2hva2UgYSBwZWVyXG4gIGlmICghc2VsZi5fcmVjaG9rZU9wdGltaXN0aWNXaXJlICYmIGkgPCBwZWVycy5sZW5ndGggJiYgc2VsZi5fcmVjaG9rZU51bVNsb3RzKSB7XG4gICAgdmFyIGNhbmRpZGF0ZXMgPSBwZWVycy5zbGljZShpKS5maWx0ZXIoZnVuY3Rpb24gKHBlZXIpIHsgcmV0dXJuIHBlZXIud2lyZS5wZWVySW50ZXJlc3RlZCB9KVxuICAgIHZhciBvcHRpbWlzdGljID0gY2FuZGlkYXRlc1tyYW5kb21JbnQoY2FuZGlkYXRlcy5sZW5ndGgpXVxuXG4gICAgaWYgKG9wdGltaXN0aWMpIHtcbiAgICAgIG9wdGltaXN0aWMuaXNDaG9rZWQgPSBmYWxzZVxuICAgICAgc2VsZi5fcmVjaG9rZU9wdGltaXN0aWNXaXJlID0gb3B0aW1pc3RpYy53aXJlXG4gICAgICBzZWxmLl9yZWNob2tlT3B0aW1pc3RpY1RpbWUgPSBSRUNIT0tFX09QVElNSVNUSUNfRFVSQVRJT05cbiAgICB9XG4gIH1cblxuICAvLyBVbmNob2tlIGJlc3QgcGVlcnNcbiAgcGVlcnMuZm9yRWFjaChmdW5jdGlvbiAocGVlcikge1xuICAgIGlmIChwZWVyLndpcmUuYW1DaG9raW5nICE9PSBwZWVyLmlzQ2hva2VkKSB7XG4gICAgICBpZiAocGVlci5pc0Nob2tlZCkgcGVlci53aXJlLmNob2tlKClcbiAgICAgIGVsc2UgcGVlci53aXJlLnVuY2hva2UoKVxuICAgIH1cbiAgfSlcblxuICBmdW5jdGlvbiByZWNob2tlU29ydCAocGVlckEsIHBlZXJCKSB7XG4gICAgLy8gUHJlZmVyIGhpZ2hlciBkb3dubG9hZCBzcGVlZFxuICAgIGlmIChwZWVyQS5kb3dubG9hZFNwZWVkICE9PSBwZWVyQi5kb3dubG9hZFNwZWVkKVxuICAgICAgcmV0dXJuIHBlZXJCLmRvd25sb2FkU3BlZWQgLSBwZWVyQS5kb3dubG9hZFNwZWVkXG5cbiAgICAvLyBQcmVmZXIgaGlnaGVyIHVwbG9hZCBzcGVlZFxuICAgIGlmIChwZWVyQS51cGxvYWRTcGVlZCAhPT0gcGVlckIudXBsb2FkU3BlZWQpXG4gICAgICByZXR1cm4gcGVlckIudXBsb2FkU3BlZWQgLSBwZWVyQS51cGxvYWRTcGVlZFxuXG4gICAgLy8gUHJlZmVyIHVuY2hva2VkXG4gICAgaWYgKHBlZXJBLndpcmUuYW1DaG9raW5nICE9PSBwZWVyQi53aXJlLmFtQ2hva2luZylcbiAgICAgIHJldHVybiBwZWVyQS53aXJlLmFtQ2hva2luZyA/IDEgOiAtMVxuXG4gICAgLy8gUmFuZG9tIG9yZGVyXG4gICAgcmV0dXJuIHBlZXJBLnNhbHQgLSBwZWVyQi5zYWx0XG4gIH1cbn1cblxuLyoqXG4gKiBBdHRlbXB0cyB0byBjYW5jZWwgYSBzbG93IGJsb2NrIHJlcXVlc3QgZnJvbSBhbm90aGVyIHdpcmUgc3VjaCB0aGF0IHRoZVxuICogZ2l2ZW4gd2lyZSBtYXkgZWZmZWN0aXZlbHkgc3dhcCBvdXQgdGhlIHJlcXVlc3QgZm9yIG9uZSBvZiBpdHMgb3duLlxuICovXG5Ub3JyZW50LnByb3RvdHlwZS5faG90c3dhcCA9IGZ1bmN0aW9uICh3aXJlLCBpbmRleCkge1xuICB2YXIgc2VsZiA9IHRoaXNcbiAgaWYgKCFzZWxmLmhvdHN3YXBFbmFibGVkKSByZXR1cm4gZmFsc2VcblxuICB2YXIgc3BlZWQgPSB3aXJlLmRvd25sb2FkU3BlZWQoKVxuICBpZiAoc3BlZWQgPCBTdG9yYWdlLkJMT0NLX0xFTkdUSCkgcmV0dXJuIGZhbHNlXG4gIGlmICghc2VsZi5fcmVzZXJ2YXRpb25zW2luZGV4XSkgcmV0dXJuIGZhbHNlXG5cbiAgdmFyIHIgPSBzZWxmLl9yZXNlcnZhdGlvbnNbaW5kZXhdXG4gIGlmICghcikge1xuICAgIHJldHVybiBmYWxzZVxuICB9XG5cbiAgdmFyIG1pblNwZWVkID0gSW5maW5pdHlcbiAgdmFyIG1pbldpcmVcblxuICB2YXIgaVxuICBmb3IgKGkgPSAwOyBpIDwgci5sZW5ndGg7IGkrKykge1xuICAgIHZhciBvdGhlcldpcmUgPSByW2ldXG4gICAgaWYgKCFvdGhlcldpcmUgfHwgb3RoZXJXaXJlID09PSB3aXJlKSBjb250aW51ZVxuXG4gICAgdmFyIG90aGVyU3BlZWQgPSBvdGhlcldpcmUuZG93bmxvYWRTcGVlZCgpXG4gICAgaWYgKG90aGVyU3BlZWQgPj0gU1BFRURfVEhSRVNIT0xEKSBjb250aW51ZVxuICAgIGlmICgyICogb3RoZXJTcGVlZCA+IHNwZWVkIHx8IG90aGVyU3BlZWQgPiBtaW5TcGVlZCkgY29udGludWVcblxuICAgIG1pbldpcmUgPSBvdGhlcldpcmVcbiAgICBtaW5TcGVlZCA9IG90aGVyU3BlZWRcbiAgfVxuXG4gIGlmICghbWluV2lyZSkgcmV0dXJuIGZhbHNlXG5cbiAgZm9yIChpID0gMDsgaSA8IHIubGVuZ3RoOyBpKyspIHtcbiAgICBpZiAocltpXSA9PT0gbWluV2lyZSkgcltpXSA9IG51bGxcbiAgfVxuXG4gIGZvciAoaSA9IDA7IGkgPCBtaW5XaXJlLnJlcXVlc3RzLmxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIHJlcSA9IG1pbldpcmUucmVxdWVzdHNbaV1cbiAgICBpZiAocmVxLnBpZWNlICE9PSBpbmRleCkgY29udGludWVcblxuICAgIHNlbGYuc3RvcmFnZS5jYW5jZWxCbG9jayhpbmRleCwgcmVxLm9mZnNldClcbiAgfVxuXG4gIHNlbGYuZW1pdCgnaG90c3dhcCcsIG1pbldpcmUsIHdpcmUsIGluZGV4KVxuICByZXR1cm4gdHJ1ZVxufVxuXG4vKipcbiAqIEF0dGVtcHRzIHRvIHJlcXVlc3QgYSBibG9jayBmcm9tIHRoZSBnaXZlbiB3aXJlLlxuICovXG5Ub3JyZW50LnByb3RvdHlwZS5fcmVxdWVzdCA9IGZ1bmN0aW9uICh3aXJlLCBpbmRleCwgaG90c3dhcCkge1xuICB2YXIgc2VsZiA9IHRoaXNcbiAgdmFyIG51bVJlcXVlc3RzID0gd2lyZS5yZXF1ZXN0cy5sZW5ndGhcblxuICBpZiAoc2VsZi5zdG9yYWdlLmJpdGZpZWxkLmdldChpbmRleCkpIHJldHVybiBmYWxzZVxuICB2YXIgbWF4T3V0c3RhbmRpbmdSZXF1ZXN0cyA9IGdldFBpcGVsaW5lTGVuZ3RoKHdpcmUsIFBJUEVMSU5FX01BWF9EVVJBVElPTilcbiAgaWYgKG51bVJlcXVlc3RzID49IG1heE91dHN0YW5kaW5nUmVxdWVzdHMpIHJldHVybiBmYWxzZVxuXG4gIHZhciBlbmRHYW1lID0gKHdpcmUucmVxdWVzdHMubGVuZ3RoID09PSAwICYmIHNlbGYuc3RvcmFnZS5udW1NaXNzaW5nIDwgMzApXG4gIHZhciBibG9jayA9IHNlbGYuc3RvcmFnZS5yZXNlcnZlQmxvY2soaW5kZXgsIGVuZEdhbWUpXG5cbiAgaWYgKCFibG9jayAmJiAhZW5kR2FtZSAmJiBob3Rzd2FwICYmIHNlbGYuX2hvdHN3YXAod2lyZSwgaW5kZXgpKVxuICAgIGJsb2NrID0gc2VsZi5zdG9yYWdlLnJlc2VydmVCbG9jayhpbmRleCwgZmFsc2UpXG4gIGlmICghYmxvY2spIHJldHVybiBmYWxzZVxuXG4gIHZhciByID0gc2VsZi5fcmVzZXJ2YXRpb25zW2luZGV4XVxuICBpZiAoIXIpIHtcbiAgICByID0gc2VsZi5fcmVzZXJ2YXRpb25zW2luZGV4XSA9IFtdXG4gIH1cbiAgdmFyIGkgPSByLmluZGV4T2YobnVsbClcbiAgaWYgKGkgPT09IC0xKSBpID0gci5sZW5ndGhcbiAgcltpXSA9IHdpcmVcblxuICBmdW5jdGlvbiBnb3RQaWVjZSAoZXJyLCBidWZmZXIpIHtcbiAgICBpZiAoIXNlbGYucmVhZHkpIHtcbiAgICAgIHNlbGYub25jZSgncmVhZHknLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGdvdFBpZWNlKGVyciwgYnVmZmVyKVxuICAgICAgfSlcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIGlmIChyW2ldID09PSB3aXJlKSByW2ldID0gbnVsbFxuXG4gICAgaWYgKGVycikge1xuICAgICAgZGVidWcoXG4gICAgICAgICdlcnJvciBnZXR0aW5nIHBpZWNlICVzIChvZmZzZXQ6ICVzIGxlbmd0aDogJXMpIGZyb20gJXM6ICVzJyxcbiAgICAgICAgaW5kZXgsIGJsb2NrLm9mZnNldCwgYmxvY2subGVuZ3RoLCB3aXJlLnJlbW90ZUFkZHJlc3MsIGVyci5tZXNzYWdlXG4gICAgICApXG4gICAgICBzZWxmLnN0b3JhZ2UuY2FuY2VsQmxvY2soaW5kZXgsIGJsb2NrLm9mZnNldClcbiAgICAgIHByb2Nlc3MubmV4dFRpY2soc2VsZi5fdXBkYXRlLmJpbmQoc2VsZikpXG4gICAgICByZXR1cm4gZmFsc2VcbiAgICB9IGVsc2Uge1xuICAgICAgZGVidWcoXG4gICAgICAgICdnb3QgcGllY2UgJXMgKG9mZnNldDogJXMgbGVuZ3RoOiAlcykgZnJvbSAlcycsXG4gICAgICAgIGluZGV4LCBibG9jay5vZmZzZXQsIGJsb2NrLmxlbmd0aCwgd2lyZS5yZW1vdGVBZGRyZXNzXG4gICAgICApXG4gICAgICBzZWxmLnN0b3JhZ2Uud3JpdGVCbG9jayhpbmRleCwgYmxvY2sub2Zmc2V0LCBidWZmZXIsIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgIGRlYnVnKCdlcnJvciB3cml0aW5nIGJsb2NrJylcbiAgICAgICAgICBzZWxmLnN0b3JhZ2UuY2FuY2VsQmxvY2soaW5kZXgsIGJsb2NrLm9mZnNldClcbiAgICAgICAgfVxuXG4gICAgICAgIHByb2Nlc3MubmV4dFRpY2soc2VsZi5fdXBkYXRlLmJpbmQoc2VsZikpXG4gICAgICB9KVxuICAgIH1cbiAgfVxuXG4gIHdpcmUucmVxdWVzdChpbmRleCwgYmxvY2sub2Zmc2V0LCBibG9jay5sZW5ndGgsIGdvdFBpZWNlKVxuXG4gIHJldHVybiB0cnVlXG59XG5cblRvcnJlbnQucHJvdG90eXBlLmNyZWF0ZVNlcnZlciA9IGZ1bmN0aW9uIChvcHRzKSB7XG4gIHZhciBzZWxmID0gdGhpc1xuICBpZiAodHlwZW9mIFNlcnZlciA9PT0gJ2Z1bmN0aW9uJyAvKiBicm93c2VyIGV4Y2x1ZGUgKi8pIHtcbiAgICByZXR1cm4gbmV3IFNlcnZlcihzZWxmLCBvcHRzKVxuICB9XG59XG5cbmZ1bmN0aW9uIGdldFBpcGVsaW5lTGVuZ3RoICh3aXJlLCBkdXJhdGlvbikge1xuICByZXR1cm4gTWF0aC5jZWlsKDIgKyBkdXJhdGlvbiAqIHdpcmUuZG93bmxvYWRTcGVlZCgpIC8gU3RvcmFnZS5CTE9DS19MRU5HVEgpXG59XG5cbi8qKlxuICogUmV0dXJucyBhIHJhbmRvbSBpbnRlZ2VyIGluIFswLGhpZ2gpXG4gKi9cbmZ1bmN0aW9uIHJhbmRvbUludCAoaGlnaCkge1xuICByZXR1cm4gTWF0aC5yYW5kb20oKSAqIGhpZ2ggfCAwXG59XG5cbi8qKlxuICogSXRlcmF0ZXMgdGhyb3VnaCB0aGUgZ2l2ZW4gYXJyYXkgaW4gYSByYW5kb20gb3JkZXIsIGNhbGxpbmcgdGhlIGdpdmVuXG4gKiBjYWxsYmFjayBmb3IgZWFjaCBlbGVtZW50LlxuICovXG5mdW5jdGlvbiByYW5kb21pemVkRm9yRWFjaCAoYXJyYXksIGNiKSB7XG4gIHZhciBpbmRpY2VzID0gYXJyYXkubWFwKGZ1bmN0aW9uICh2YWx1ZSwgaW5kZXgpIHsgcmV0dXJuIGluZGV4IH0pXG5cbiAgZm9yICh2YXIgaSA9IGluZGljZXMubGVuZ3RoIC0gMTsgaSA+IDA7IC0taSkge1xuICAgIHZhciBqID0gcmFuZG9tSW50KGkgKyAxKVxuICAgIHZhciB0bXAgPSBpbmRpY2VzW2ldXG4gICAgaW5kaWNlc1tpXSA9IGluZGljZXNbal1cbiAgICBpbmRpY2VzW2pdID0gdG1wXG4gIH1cblxuICBpbmRpY2VzLmZvckVhY2goZnVuY3Rpb24gKGluZGV4KSB7XG4gICAgY2IoYXJyYXlbaW5kZXhdLCBpbmRleCwgYXJyYXkpXG4gIH0pXG59XG4iLCJ2YXIgQ29udGFpbmVyID0gdHlwZW9mIEJ1ZmZlciAhPT0gXCJ1bmRlZmluZWRcIiA/IEJ1ZmZlciAvL2luIG5vZGUsIHVzZSBidWZmZXJzXHJcblx0XHQ6IHR5cGVvZiBJbnQ4QXJyYXkgIT09IFwidW5kZWZpbmVkXCIgPyBJbnQ4QXJyYXkgLy9pbiBuZXdlciBicm93c2VycywgdXNlIHdlYmdsIGludDhhcnJheXNcclxuXHRcdDogZnVuY3Rpb24obCl7IHZhciBhID0gbmV3IEFycmF5KGwpOyBmb3IodmFyIGkgPSAwOyBpIDwgbDsgaSsrKSBhW2ldPTA7IH07IC8vZWxzZSwgZG8gc29tZXRoaW5nIHNpbWlsYXJcclxuXHJcbmZ1bmN0aW9uIEJpdEZpZWxkKGRhdGEsIG9wdHMpe1xyXG5cdGlmKCEodGhpcyBpbnN0YW5jZW9mIEJpdEZpZWxkKSkge1xyXG5cdFx0cmV0dXJuIG5ldyBCaXRGaWVsZChkYXRhLCBvcHRzKTtcclxuXHR9XHJcblxyXG5cdGlmKGFyZ3VtZW50cy5sZW5ndGggPT09IDApe1xyXG5cdFx0ZGF0YSA9IDA7XHJcblx0fVxyXG5cclxuXHR0aGlzLmdyb3cgPSBvcHRzICYmIChpc0Zpbml0ZShvcHRzLmdyb3cpICYmIGdldEJ5dGVTaXplKG9wdHMuZ3JvdykgfHwgb3B0cy5ncm93KSB8fCAwO1xyXG5cclxuXHRpZih0eXBlb2YgZGF0YSA9PT0gXCJudW1iZXJcIiB8fCBkYXRhID09PSB1bmRlZmluZWQpe1xyXG5cdFx0ZGF0YSA9IG5ldyBDb250YWluZXIoZ2V0Qnl0ZVNpemUoZGF0YSkpO1xyXG5cdFx0aWYoZGF0YS5maWxsKSBkYXRhLmZpbGwoMCk7IC8vIGNsZWFyIG5vZGUgYnVmZmVycyBvZiBnYXJiYWdlXHJcblx0fVxyXG5cdHRoaXMuYnVmZmVyID0gZGF0YTtcclxufVxyXG5cclxuZnVuY3Rpb24gZ2V0Qnl0ZVNpemUobnVtKXtcclxuXHR2YXIgb3V0ID0gbnVtID4+IDM7XHJcblx0aWYobnVtICUgOCAhPT0gMCkgb3V0Kys7XHJcblx0cmV0dXJuIG91dDtcclxufVxyXG5cclxuQml0RmllbGQucHJvdG90eXBlLmdldCA9IGZ1bmN0aW9uKGkpe1xyXG5cdHZhciBqID0gaSA+PiAzO1xyXG5cdHJldHVybiAoaiA8IHRoaXMuYnVmZmVyLmxlbmd0aCkgJiZcclxuXHRcdCEhKHRoaXMuYnVmZmVyW2pdICYgKDEyOCA+PiAoaSAlIDgpKSk7XHJcbn07XHJcblxyXG5CaXRGaWVsZC5wcm90b3R5cGUuc2V0ID0gZnVuY3Rpb24oaSwgYil7XHJcblx0dmFyIGogPSBpID4+IDM7XHJcblx0aWYgKGIgfHwgYXJndW1lbnRzLmxlbmd0aCA9PT0gMSl7XHJcblx0XHRpZiAodGhpcy5idWZmZXIubGVuZ3RoIDwgaiArIDEpIHRoaXMuX2dyb3coTWF0aC5tYXgoaiArIDEsIE1hdGgubWluKDIgKiB0aGlzLmJ1ZmZlci5sZW5ndGgsIHRoaXMuZ3JvdykpKTtcclxuXHRcdC8vIFNldFxyXG5cdFx0dGhpcy5idWZmZXJbal0gfD0gMTI4ID4+IChpICUgOCk7XHJcblx0fSBlbHNlIGlmIChqIDwgdGhpcy5idWZmZXIubGVuZ3RoKSB7XHJcblx0XHQvLy8gQ2xlYXJcclxuXHRcdHRoaXMuYnVmZmVyW2pdICY9IH4oMTI4ID4+IChpICUgOCkpO1xyXG5cdH1cclxufTtcclxuXHJcbkJpdEZpZWxkLnByb3RvdHlwZS5fZ3JvdyA9IGZ1bmN0aW9uKGxlbmd0aCkge1xyXG5cdGlmICh0aGlzLmJ1ZmZlci5sZW5ndGggPCBsZW5ndGggJiYgbGVuZ3RoIDw9IHRoaXMuZ3Jvdykge1xyXG5cdFx0dmFyIG5ld0J1ZmZlciA9IG5ldyBDb250YWluZXIobGVuZ3RoKTtcclxuXHRcdGlmIChuZXdCdWZmZXIuZmlsbCkgbmV3QnVmZmVyLmZpbGwoMCk7XHJcblx0XHRpZiAodGhpcy5idWZmZXIuY29weSkgdGhpcy5idWZmZXIuY29weShuZXdCdWZmZXIsIDApO1xyXG5cdFx0ZWxzZSB7XHJcblx0XHRcdGZvcih2YXIgaSA9IDA7IGkgPCB0aGlzLmJ1ZmZlci5sZW5ndGg7IGkrKykge1xyXG5cdFx0XHRcdG5ld0J1ZmZlcltpXSA9IHRoaXMuYnVmZmVyW2ldO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblx0XHR0aGlzLmJ1ZmZlciA9IG5ld0J1ZmZlcjtcclxuXHR9XHJcbn07XHJcblxyXG5pZih0eXBlb2YgbW9kdWxlICE9PSBcInVuZGVmaW5lZFwiKSBtb2R1bGUuZXhwb3J0cyA9IEJpdEZpZWxkO1xyXG4iLCIvLyB3cml0ZSBkYXRhIHRvIGl0LCBhbmQgaXQnbGwgZW1pdCBkYXRhIGluIDUxMiBieXRlIGJsb2Nrcy5cbi8vIGlmIHlvdSAuZW5kKCkgb3IgLmZsdXNoKCksIGl0J2xsIGVtaXQgd2hhdGV2ZXIgaXQncyBnb3QsXG4vLyBwYWRkZWQgd2l0aCBudWxscyB0byA1MTIgYnl0ZXMuXG5cbm1vZHVsZS5leHBvcnRzID0gQmxvY2tTdHJlYW1cblxudmFyIFN0cmVhbSA9IHJlcXVpcmUoXCJzdHJlYW1cIikuU3RyZWFtXG4gICwgaW5oZXJpdHMgPSByZXF1aXJlKFwiaW5oZXJpdHNcIilcbiAgLCBhc3NlcnQgPSByZXF1aXJlKFwiYXNzZXJ0XCIpLm9rXG4gICwgZGVidWcgPSBwcm9jZXNzLmVudi5ERUJVRyA/IGNvbnNvbGUuZXJyb3IgOiBmdW5jdGlvbiAoKSB7fVxuXG5mdW5jdGlvbiBCbG9ja1N0cmVhbSAoc2l6ZSwgb3B0KSB7XG4gIHRoaXMud3JpdGFibGUgPSB0aGlzLnJlYWRhYmxlID0gdHJ1ZVxuICB0aGlzLl9vcHQgPSBvcHQgfHwge31cbiAgdGhpcy5fY2h1bmtTaXplID0gc2l6ZSB8fCA1MTJcbiAgdGhpcy5fb2Zmc2V0ID0gMFxuICB0aGlzLl9idWZmZXIgPSBbXVxuICB0aGlzLl9idWZmZXJMZW5ndGggPSAwXG4gIGlmICh0aGlzLl9vcHQubm9wYWQpIHRoaXMuX3plcm9lcyA9IGZhbHNlXG4gIGVsc2Uge1xuICAgIHRoaXMuX3plcm9lcyA9IG5ldyBCdWZmZXIodGhpcy5fY2h1bmtTaXplKVxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5fY2h1bmtTaXplOyBpICsrKSB7XG4gICAgICB0aGlzLl96ZXJvZXNbaV0gPSAwXG4gICAgfVxuICB9XG59XG5cbmluaGVyaXRzKEJsb2NrU3RyZWFtLCBTdHJlYW0pXG5cbkJsb2NrU3RyZWFtLnByb3RvdHlwZS53cml0ZSA9IGZ1bmN0aW9uIChjKSB7XG4gIC8vIGRlYnVnKFwiICAgQlMgd3JpdGVcIiwgYylcbiAgaWYgKHRoaXMuX2VuZGVkKSB0aHJvdyBuZXcgRXJyb3IoXCJCbG9ja1N0cmVhbTogd3JpdGUgYWZ0ZXIgZW5kXCIpXG4gIGlmIChjICYmICFCdWZmZXIuaXNCdWZmZXIoYykpIGMgPSBuZXcgQnVmZmVyKGMgKyBcIlwiKVxuICBpZiAoYy5sZW5ndGgpIHtcbiAgICB0aGlzLl9idWZmZXIucHVzaChjKVxuICAgIHRoaXMuX2J1ZmZlckxlbmd0aCArPSBjLmxlbmd0aFxuICB9XG4gIC8vIGRlYnVnKFwicHVzaGVkIG9udG8gYnVmZmVyXCIsIHRoaXMuX2J1ZmZlckxlbmd0aClcbiAgaWYgKHRoaXMuX2J1ZmZlckxlbmd0aCA+PSB0aGlzLl9jaHVua1NpemUpIHtcbiAgICBpZiAodGhpcy5fcGF1c2VkKSB7XG4gICAgICAvLyBkZWJ1ZyhcIiAgIEJTIHBhdXNlZCwgcmV0dXJuIGZhbHNlLCBuZWVkIGRyYWluXCIpXG4gICAgICB0aGlzLl9uZWVkRHJhaW4gPSB0cnVlXG4gICAgICByZXR1cm4gZmFsc2VcbiAgICB9XG4gICAgdGhpcy5fZW1pdENodW5rKClcbiAgfVxuICByZXR1cm4gdHJ1ZVxufVxuXG5CbG9ja1N0cmVhbS5wcm90b3R5cGUucGF1c2UgPSBmdW5jdGlvbiAoKSB7XG4gIC8vIGRlYnVnKFwiICAgQlMgcGF1c2luZ1wiKVxuICB0aGlzLl9wYXVzZWQgPSB0cnVlXG59XG5cbkJsb2NrU3RyZWFtLnByb3RvdHlwZS5yZXN1bWUgPSBmdW5jdGlvbiAoKSB7XG4gIC8vIGRlYnVnKFwiICAgQlMgcmVzdW1lXCIpXG4gIHRoaXMuX3BhdXNlZCA9IGZhbHNlXG4gIHJldHVybiB0aGlzLl9lbWl0Q2h1bmsoKVxufVxuXG5CbG9ja1N0cmVhbS5wcm90b3R5cGUuZW5kID0gZnVuY3Rpb24gKGNodW5rKSB7XG4gIC8vIGRlYnVnKFwiZW5kXCIsIGNodW5rKVxuICBpZiAodHlwZW9mIGNodW5rID09PSBcImZ1bmN0aW9uXCIpIGNiID0gY2h1bmssIGNodW5rID0gbnVsbFxuICBpZiAoY2h1bmspIHRoaXMud3JpdGUoY2h1bmspXG4gIHRoaXMuX2VuZGVkID0gdHJ1ZVxuICB0aGlzLmZsdXNoKClcbn1cblxuQmxvY2tTdHJlYW0ucHJvdG90eXBlLmZsdXNoID0gZnVuY3Rpb24gKCkge1xuICB0aGlzLl9lbWl0Q2h1bmsodHJ1ZSlcbn1cblxuQmxvY2tTdHJlYW0ucHJvdG90eXBlLl9lbWl0Q2h1bmsgPSBmdW5jdGlvbiAoZmx1c2gpIHtcbiAgLy8gZGVidWcoXCJlbWl0Q2h1bmsgZmx1c2g9JWogZW1pdHRpbmc9JWogcGF1c2VkPSVqXCIsIGZsdXNoLCB0aGlzLl9lbWl0dGluZywgdGhpcy5fcGF1c2VkKVxuXG4gIC8vIGVtaXQgYSA8Y2h1bmtTaXplPiBjaHVua1xuICBpZiAoZmx1c2ggJiYgdGhpcy5femVyb2VzKSB7XG4gICAgLy8gZGVidWcoXCIgICAgQlMgcHVzaCB6ZXJvZXNcIiwgdGhpcy5fYnVmZmVyTGVuZ3RoKVxuICAgIC8vIHB1c2ggYSBjaHVuayBvZiB6ZXJvZXNcbiAgICB2YXIgcGFkQnl0ZXMgPSAodGhpcy5fYnVmZmVyTGVuZ3RoICUgdGhpcy5fY2h1bmtTaXplKVxuICAgIGlmIChwYWRCeXRlcyAhPT0gMCkgcGFkQnl0ZXMgPSB0aGlzLl9jaHVua1NpemUgLSBwYWRCeXRlc1xuICAgIGlmIChwYWRCeXRlcyA+IDApIHtcbiAgICAgIC8vIGRlYnVnKFwicGFkQnl0ZXNcIiwgcGFkQnl0ZXMsIHRoaXMuX3plcm9lcy5zbGljZSgwLCBwYWRCeXRlcykpXG4gICAgICB0aGlzLl9idWZmZXIucHVzaCh0aGlzLl96ZXJvZXMuc2xpY2UoMCwgcGFkQnl0ZXMpKVxuICAgICAgdGhpcy5fYnVmZmVyTGVuZ3RoICs9IHBhZEJ5dGVzXG4gICAgICAvLyBkZWJ1Zyh0aGlzLl9idWZmZXJbdGhpcy5fYnVmZmVyLmxlbmd0aCAtIDFdLmxlbmd0aCwgdGhpcy5fYnVmZmVyTGVuZ3RoKVxuICAgIH1cbiAgfVxuXG4gIGlmICh0aGlzLl9lbWl0dGluZyB8fCB0aGlzLl9wYXVzZWQpIHJldHVyblxuICB0aGlzLl9lbWl0dGluZyA9IHRydWVcblxuICAvLyBkZWJ1ZyhcIiAgICBCUyBlbnRlcmluZyBsb29wc1wiKVxuICB2YXIgYnVmZmVySW5kZXggPSAwXG4gIHdoaWxlICh0aGlzLl9idWZmZXJMZW5ndGggPj0gdGhpcy5fY2h1bmtTaXplICYmXG4gICAgICAgICAoZmx1c2ggfHwgIXRoaXMuX3BhdXNlZCkpIHtcbiAgICAvLyBkZWJ1ZyhcIiAgICAgQlMgZGF0YSBlbWlzc2lvbiBsb29wXCIsIHRoaXMuX2J1ZmZlckxlbmd0aClcblxuICAgIHZhciBvdXRcbiAgICAgICwgb3V0T2Zmc2V0ID0gMFxuICAgICAgLCBvdXRIYXMgPSB0aGlzLl9jaHVua1NpemVcblxuICAgIHdoaWxlIChvdXRIYXMgPiAwICYmIChmbHVzaCB8fCAhdGhpcy5fcGF1c2VkKSApIHtcbiAgICAgIC8vIGRlYnVnKFwiICAgIEJTIGRhdGEgaW5uZXIgZW1pdCBsb29wXCIsIHRoaXMuX2J1ZmZlckxlbmd0aClcbiAgICAgIHZhciBjdXIgPSB0aGlzLl9idWZmZXJbYnVmZmVySW5kZXhdXG4gICAgICAgICwgY3VySGFzID0gY3VyLmxlbmd0aCAtIHRoaXMuX29mZnNldFxuICAgICAgLy8gZGVidWcoXCJjdXI9XCIsIGN1cilcbiAgICAgIC8vIGRlYnVnKFwiY3VySGFzPSVqXCIsIGN1ckhhcylcbiAgICAgIC8vIElmIGl0J3Mgbm90IGJpZyBlbm91Z2ggdG8gZmlsbCB0aGUgd2hvbGUgdGhpbmcsIHRoZW4gd2UnbGwgbmVlZFxuICAgICAgLy8gdG8gY29weSBtdWx0aXBsZSBidWZmZXJzIGludG8gb25lLiAgSG93ZXZlciwgaWYgaXQgaXMgYmlnIGVub3VnaCxcbiAgICAgIC8vIHRoZW4ganVzdCBzbGljZSBvdXQgdGhlIHBhcnQgd2Ugd2FudCwgdG8gc2F2ZSB1bm5lY2Vzc2FyeSBjb3B5aW5nLlxuICAgICAgLy8gQWxzbywgbmVlZCB0byBjb3B5IGlmIHdlJ3ZlIGFscmVhZHkgZG9uZSBzb21lIGNvcHlpbmcsIHNpbmNlIGJ1ZmZlcnNcbiAgICAgIC8vIGNhbid0IGJlIGpvaW5lZCBsaWtlIGNvbnMgc3RyaW5ncy5cbiAgICAgIGlmIChvdXQgfHwgY3VySGFzIDwgb3V0SGFzKSB7XG4gICAgICAgIG91dCA9IG91dCB8fCBuZXcgQnVmZmVyKHRoaXMuX2NodW5rU2l6ZSlcbiAgICAgICAgY3VyLmNvcHkob3V0LCBvdXRPZmZzZXQsXG4gICAgICAgICAgICAgICAgIHRoaXMuX29mZnNldCwgdGhpcy5fb2Zmc2V0ICsgTWF0aC5taW4oY3VySGFzLCBvdXRIYXMpKVxuICAgICAgfSBlbHNlIGlmIChjdXIubGVuZ3RoID09PSBvdXRIYXMgJiYgdGhpcy5fb2Zmc2V0ID09PSAwKSB7XG4gICAgICAgIC8vIHNob3J0Y3V0IC0tIGN1ciBpcyBleGFjdGx5IGxvbmcgZW5vdWdoLCBhbmQgbm8gb2Zmc2V0LlxuICAgICAgICBvdXQgPSBjdXJcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIHNsaWNlIG91dCB0aGUgcGllY2Ugb2YgY3VyIHRoYXQgd2UgbmVlZC5cbiAgICAgICAgb3V0ID0gY3VyLnNsaWNlKHRoaXMuX29mZnNldCwgdGhpcy5fb2Zmc2V0ICsgb3V0SGFzKVxuICAgICAgfVxuXG4gICAgICBpZiAoY3VySGFzID4gb3V0SGFzKSB7XG4gICAgICAgIC8vIG1lYW5zIHRoYXQgdGhlIGN1cnJlbnQgYnVmZmVyIGNvdWxkbid0IGJlIGNvbXBsZXRlbHkgb3V0cHV0XG4gICAgICAgIC8vIHVwZGF0ZSB0aGlzLl9vZmZzZXQgdG8gcmVmbGVjdCBob3cgbXVjaCBXQVMgd3JpdHRlblxuICAgICAgICB0aGlzLl9vZmZzZXQgKz0gb3V0SGFzXG4gICAgICAgIG91dEhhcyA9IDBcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIG91dHB1dCB0aGUgZW50aXJlIGN1cnJlbnQgY2h1bmsuXG4gICAgICAgIC8vIHRvc3MgaXQgYXdheVxuICAgICAgICBvdXRIYXMgLT0gY3VySGFzXG4gICAgICAgIG91dE9mZnNldCArPSBjdXJIYXNcbiAgICAgICAgYnVmZmVySW5kZXggKytcbiAgICAgICAgdGhpcy5fb2Zmc2V0ID0gMFxuICAgICAgfVxuICAgIH1cblxuICAgIHRoaXMuX2J1ZmZlckxlbmd0aCAtPSB0aGlzLl9jaHVua1NpemVcbiAgICBhc3NlcnQob3V0Lmxlbmd0aCA9PT0gdGhpcy5fY2h1bmtTaXplKVxuICAgIC8vIGRlYnVnKFwiZW1pdHRpbmcgZGF0YVwiLCBvdXQpXG4gICAgLy8gZGVidWcoXCIgICBCUyBlbWl0dGluZywgcGF1c2VkPSVqXCIsIHRoaXMuX3BhdXNlZCwgdGhpcy5fYnVmZmVyTGVuZ3RoKVxuICAgIHRoaXMuZW1pdChcImRhdGFcIiwgb3V0KVxuICAgIG91dCA9IG51bGxcbiAgfVxuICAvLyBkZWJ1ZyhcIiAgICBCUyBvdXQgb2YgbG9vcHNcIiwgdGhpcy5fYnVmZmVyTGVuZ3RoKVxuXG4gIC8vIHdoYXRldmVyIGlzIGxlZnQsIGl0J3Mgbm90IGVub3VnaCB0byBmaWxsIHVwIGEgYmxvY2ssIG9yIHdlJ3JlIHBhdXNlZFxuICB0aGlzLl9idWZmZXIgPSB0aGlzLl9idWZmZXIuc2xpY2UoYnVmZmVySW5kZXgpXG4gIGlmICh0aGlzLl9wYXVzZWQpIHtcbiAgICAvLyBkZWJ1ZyhcIiAgICBCUyBwYXVzZWQsIGxlYXZpbmdcIiwgdGhpcy5fYnVmZmVyTGVuZ3RoKVxuICAgIHRoaXMuX25lZWRzRHJhaW4gPSB0cnVlXG4gICAgdGhpcy5fZW1pdHRpbmcgPSBmYWxzZVxuICAgIHJldHVyblxuICB9XG5cbiAgLy8gaWYgZmx1c2hpbmcsIGFuZCBub3QgdXNpbmcgbnVsbC1wYWRkaW5nLCB0aGVuIG5lZWQgdG8gZW1pdCB0aGUgbGFzdFxuICAvLyBjaHVuayhzKSBzaXR0aW5nIGluIHRoZSBxdWV1ZS4gIFdlIGtub3cgdGhhdCBpdCdzIG5vdCBlbm91Z2ggdG9cbiAgLy8gZmlsbCB1cCBhIHdob2xlIGJsb2NrLCBiZWNhdXNlIG90aGVyd2lzZSBpdCB3b3VsZCBoYXZlIGJlZW4gZW1pdHRlZFxuICAvLyBhYm92ZSwgYnV0IHRoZXJlIG1heSBiZSBzb21lIG9mZnNldC5cbiAgdmFyIGwgPSB0aGlzLl9idWZmZXIubGVuZ3RoXG4gIGlmIChmbHVzaCAmJiAhdGhpcy5femVyb2VzICYmIGwpIHtcbiAgICBpZiAobCA9PT0gMSkge1xuICAgICAgaWYgKHRoaXMuX29mZnNldCkge1xuICAgICAgICB0aGlzLmVtaXQoXCJkYXRhXCIsIHRoaXMuX2J1ZmZlclswXS5zbGljZSh0aGlzLl9vZmZzZXQpKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5lbWl0KFwiZGF0YVwiLCB0aGlzLl9idWZmZXJbMF0pXG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciBvdXRIYXMgPSB0aGlzLl9idWZmZXJMZW5ndGhcbiAgICAgICAgLCBvdXQgPSBuZXcgQnVmZmVyKG91dEhhcylcbiAgICAgICAgLCBvdXRPZmZzZXQgPSAwXG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGw7IGkgKyspIHtcbiAgICAgICAgdmFyIGN1ciA9IHRoaXMuX2J1ZmZlcltpXVxuICAgICAgICAgICwgY3VySGFzID0gY3VyLmxlbmd0aCAtIHRoaXMuX29mZnNldFxuICAgICAgICBjdXIuY29weShvdXQsIG91dE9mZnNldCwgdGhpcy5fb2Zmc2V0KVxuICAgICAgICB0aGlzLl9vZmZzZXQgPSAwXG4gICAgICAgIG91dE9mZnNldCArPSBjdXJIYXNcbiAgICAgICAgdGhpcy5fYnVmZmVyTGVuZ3RoIC09IGN1ckhhc1xuICAgICAgfVxuICAgICAgdGhpcy5lbWl0KFwiZGF0YVwiLCBvdXQpXG4gICAgfVxuICAgIC8vIHRydW5jYXRlXG4gICAgdGhpcy5fYnVmZmVyLmxlbmd0aCA9IDBcbiAgICB0aGlzLl9idWZmZXJMZW5ndGggPSAwXG4gICAgdGhpcy5fb2Zmc2V0ID0gMFxuICB9XG5cbiAgLy8gbm93IGVpdGhlciBkcmFpbmVkIG9yIGVuZGVkXG4gIC8vIGRlYnVnKFwiZWl0aGVyIGRyYWluaW5nLCBvciBlbmRlZFwiLCB0aGlzLl9idWZmZXJMZW5ndGgsIHRoaXMuX2VuZGVkKVxuICAvLyBtZWFucyB0aGF0IHdlJ3ZlIGZsdXNoZWQgb3V0IGFsbCB0aGF0IHdlIGNhbiBzbyBmYXIuXG4gIGlmICh0aGlzLl9uZWVkRHJhaW4pIHtcbiAgICAvLyBkZWJ1ZyhcImVtaXR0aW5nIGRyYWluXCIsIHRoaXMuX2J1ZmZlckxlbmd0aClcbiAgICB0aGlzLl9uZWVkRHJhaW4gPSBmYWxzZVxuICAgIHRoaXMuZW1pdChcImRyYWluXCIpXG4gIH1cblxuICBpZiAoKHRoaXMuX2J1ZmZlckxlbmd0aCA9PT0gMCkgJiYgdGhpcy5fZW5kZWQgJiYgIXRoaXMuX2VuZEVtaXR0ZWQpIHtcbiAgICAvLyBkZWJ1ZyhcImVtaXR0aW5nIGVuZFwiLCB0aGlzLl9idWZmZXJMZW5ndGgpXG4gICAgdGhpcy5fZW5kRW1pdHRlZCA9IHRydWVcbiAgICB0aGlzLmVtaXQoXCJlbmRcIilcbiAgfVxuXG4gIHRoaXMuX2VtaXR0aW5nID0gZmFsc2VcblxuICAvLyBkZWJ1ZyhcIiAgICBCUyBubyBsb25nZXIgZW1pdHRpbmdcIiwgZmx1c2gsIHRoaXMuX3BhdXNlZCwgdGhpcy5fZW1pdHRpbmcsIHRoaXMuX2J1ZmZlckxlbmd0aCwgdGhpcy5fY2h1bmtTaXplKVxufVxuIiwiLypnbG9iYWwgRmlsZUxpc3QgKi9cblxubW9kdWxlLmV4cG9ydHMgPSBjcmVhdGVUb3JyZW50XG5cbm1vZHVsZS5leHBvcnRzLmFubm91bmNlTGlzdCA9IFtcbiAgWyAndWRwOi8vdHJhY2tlci5wdWJsaWNidC5jb206ODAnIF0sXG4gIFsgJ3VkcDovL3RyYWNrZXIub3BlbmJpdHRvcnJlbnQuY29tOjgwJyBdLFxuICBbICd1ZHA6Ly9vcGVuLmRlbW9uaWkuY29tOjEzMzcnIF0sXG4gIFsgJ3VkcDovL3RyYWNrZXIud2VidG9ycmVudC5pbzo4MCcgXSxcbiAgWyAnd3NzOi8vdHJhY2tlci53ZWJ0b3JyZW50LmlvJyBdIC8vIEZvciBXZWJSVEMgcGVlcnMgKHNlZTogV2ViVG9ycmVudC5pbylcbl1cblxubW9kdWxlLmV4cG9ydHMucGFyc2VJbnB1dCA9IHBhcnNlSW5wdXRcblxudmFyIGJlbmNvZGUgPSByZXF1aXJlKCdiZW5jb2RlJylcbnZhciBCbG9ja1N0cmVhbSA9IHJlcXVpcmUoJ2Jsb2NrLXN0cmVhbScpXG52YXIgY2FsY1BpZWNlTGVuZ3RoID0gcmVxdWlyZSgncGllY2UtbGVuZ3RoJylcbnZhciBjb3JlUGF0aCA9IHJlcXVpcmUoJ3BhdGgnKVxudmFyIEZpbGVSZWFkU3RyZWFtID0gcmVxdWlyZSgnZmlsZXN0cmVhbS9yZWFkJylcbnZhciBmbGF0dGVuID0gcmVxdWlyZSgnZmxhdHRlbicpXG52YXIgZnMgPSByZXF1aXJlKCdmcycpXG52YXIgTXVsdGlTdHJlYW0gPSByZXF1aXJlKCdtdWx0aXN0cmVhbScpXG52YXIgb25jZSA9IHJlcXVpcmUoJ29uY2UnKVxudmFyIHBhcmFsbGVsID0gcmVxdWlyZSgncnVuLXBhcmFsbGVsJylcbnZhciBzaGExID0gcmVxdWlyZSgnc2ltcGxlLXNoYTEnKVxudmFyIHN0cmVhbSA9IHJlcXVpcmUoJ3N0cmVhbScpXG52YXIgVHJhbnNmb3JtID0gc3RyZWFtLlRyYW5zZm9ybVxuXG4vKipcbiAqIENyZWF0ZSBhIHRvcnJlbnQuXG4gKiBAcGFyYW0gIHtzdHJpbmd8RmlsZXxGaWxlTGlzdHxCdWZmZXJ8U3RyZWFtfEFycmF5LjxzdHJpbmd8RmlsZXxCdWZmZXJ8U3RyZWFtPn0gaW5wdXRcbiAqIEBwYXJhbSAge09iamVjdH0gb3B0c1xuICogQHBhcmFtICB7c3RyaW5nPX0gb3B0cy5uYW1lXG4gKiBAcGFyYW0gIHtEYXRlPX0gb3B0cy5jcmVhdGlvbkRhdGVcbiAqIEBwYXJhbSAge3N0cmluZz19IG9wdHMuY29tbWVudFxuICogQHBhcmFtICB7c3RyaW5nPX0gb3B0cy5jcmVhdGVkQnlcbiAqIEBwYXJhbSAge2Jvb2xlYW58bnVtYmVyPX0gb3B0cy5wcml2YXRlXG4gKiBAcGFyYW0gIHtudW1iZXI9fSBvcHRzLnBpZWNlTGVuZ3RoXG4gKiBAcGFyYW0gIHtBcnJheS48QXJyYXkuPHN0cmluZz4+PX0gb3B0cy5hbm5vdW5jZUxpc3RcbiAqIEBwYXJhbSAge0FycmF5LjxzdHJpbmc+PX0gb3B0cy51cmxMaXN0XG4gKiBAcGFyYW0gIHtmdW5jdGlvbn0gY2JcbiAqIEByZXR1cm4ge0J1ZmZlcn0gYnVmZmVyIG9mIC50b3JyZW50IGZpbGUgZGF0YVxuICovXG5mdW5jdGlvbiBjcmVhdGVUb3JyZW50IChpbnB1dCwgb3B0cywgY2IpIHtcbiAgaWYgKHR5cGVvZiBvcHRzID09PSAnZnVuY3Rpb24nKSB7XG4gICAgY2IgPSBvcHRzXG4gICAgb3B0cyA9IHt9XG4gIH1cbiAgaWYgKCFvcHRzKSBvcHRzID0ge31cbiAgcGFyc2VJbnB1dChpbnB1dCwgb3B0cywgZnVuY3Rpb24gKGVyciwgZmlsZXMpIHtcbiAgICBpZiAoZXJyKSByZXR1cm4gY2IoZXJyKVxuICAgIG9uRmlsZXMoZmlsZXMsIG9wdHMsIGNiKVxuICB9KVxufVxuXG5mdW5jdGlvbiBwYXJzZUlucHV0IChpbnB1dCwgb3B0cywgY2IpIHtcbiAgaWYgKHR5cGVvZiBvcHRzID09PSAnZnVuY3Rpb24nKSB7XG4gICAgY2IgPSBvcHRzXG4gICAgb3B0cyA9IHt9XG4gIH1cbiAgaWYgKCFvcHRzKSBvcHRzID0ge31cblxuICBpZiAoaXNGaWxlTGlzdChpbnB1dCkpXG4gICAgaW5wdXQgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChpbnB1dClcbiAgaWYgKCFBcnJheS5pc0FycmF5KGlucHV0KSlcbiAgICBpbnB1dCA9IFsgaW5wdXQgXVxuXG4gIGlmIChpbnB1dC5sZW5ndGggPT09IDApIHRocm93IG5ldyBFcnJvcignaW52YWxpZCBpbnB1dCB0eXBlJylcblxuICBpZiAoIW9wdHMubmFtZSlcbiAgICBvcHRzLm5hbWUgPSBpbnB1dFswXS5uYW1lIHx8ICh0eXBlb2YgaW5wdXRbMF0gPT09ICdzdHJpbmcnICYmIGNvcmVQYXRoLmJhc2VuYW1lKGlucHV0KSlcbiAgaWYgKG9wdHMubmFtZSA9PT0gdW5kZWZpbmVkKVxuICAgIHRocm93IG5ldyBFcnJvcignbWlzc2luZyBvcHRpb24gXFwnbmFtZVxcJyBhbmQgdW5hYmxlIHRvIGluZmVyIGl0IGZyb20gaW5wdXRbMF0ubmFtZScpXG5cbiAgLy8gSWYgdGhlcmUncyBqdXN0IG9uZSBmaWxlLCBhbGxvdyB0aGUgbmFtZSB0byBiZSBzZXQgYnkgYG9wdHMubmFtZWBcbiAgaWYgKGlucHV0Lmxlbmd0aCA9PT0gMSAmJiAhaW5wdXRbMF0ubmFtZSkgaW5wdXRbMF0ubmFtZSA9IG9wdHMubmFtZVxuXG4gIHZhciBudW1QYXRocyA9IGlucHV0LnJlZHVjZShmdW5jdGlvbiAoc3VtLCBpdGVtKSB7XG4gICAgcmV0dXJuIHN1bSArIE51bWJlcih0eXBlb2YgaXRlbSA9PT0gJ3N0cmluZycpXG4gIH0sIDApXG5cbiAgcGFyYWxsZWwoaW5wdXQubWFwKGZ1bmN0aW9uIChpdGVtKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uIChjYikge1xuICAgICAgdmFyIGZpbGUgPSB7fVxuXG4gICAgICBpZiAoaXNCbG9iKGl0ZW0pKSB7XG4gICAgICAgIGZpbGUuZ2V0U3RyZWFtID0gZ2V0QmxvYlN0cmVhbShpdGVtKVxuICAgICAgICBmaWxlLmxlbmd0aCA9IGl0ZW0uc2l6ZVxuICAgICAgfSBlbHNlIGlmIChCdWZmZXIuaXNCdWZmZXIoaXRlbSkpIHtcbiAgICAgICAgZmlsZS5nZXRTdHJlYW0gPSBnZXRCdWZmZXJTdHJlYW0oaXRlbSlcbiAgICAgICAgZmlsZS5sZW5ndGggPSBpdGVtLmxlbmd0aFxuICAgICAgfSBlbHNlIGlmIChpc1JlYWRhYmxlKGl0ZW0pKSB7XG4gICAgICAgIGlmICghb3B0cy5waWVjZUxlbmd0aClcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ211c3Qgc3BlY2lmeSBgcGllY2VMZW5ndGhgIG9wdGlvbiBpZiBpbnB1dCBpcyBTdHJlYW0nKVxuICAgICAgICBmaWxlLmdldFN0cmVhbSA9IGdldFN0cmVhbVN0cmVhbShpdGVtLCBmaWxlKVxuICAgICAgICBmaWxlLmxlbmd0aCA9IDBcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGl0ZW0gPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHZhciBrZWVwUm9vdCA9IG51bVBhdGhzID4gMVxuICAgICAgICBnZXRGaWxlcyhpdGVtLCBrZWVwUm9vdCwgY2IpXG4gICAgICAgIHJldHVybiAvLyBlYXJseSByZXR1cm4hXG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ2ludmFsaWQgaW5wdXQgdHlwZSBpbiBhcnJheScpXG4gICAgICB9XG4gICAgICBpZiAoIWl0ZW0ubmFtZSkgdGhyb3cgbmV3IEVycm9yKCdtaXNzaW5nIHJlcXVpZWQgYG5hbWVgIHByb3BlcnR5IG9uIGlucHV0JylcbiAgICAgIGZpbGUucGF0aCA9IGl0ZW0ubmFtZS5zcGxpdChjb3JlUGF0aC5zZXApXG4gICAgICBjYihudWxsLCBmaWxlKVxuICAgIH1cbiAgfSksIGZ1bmN0aW9uIChlcnIsIGZpbGVzKSB7XG4gICAgaWYgKGVycikgcmV0dXJuIGNiKGVycilcbiAgICBmaWxlcyA9IGZsYXR0ZW4oZmlsZXMpXG5cbiAgICBpZiAobnVtUGF0aHMgPT09IDApIHByb2Nlc3MubmV4dFRpY2soZnVuY3Rpb24gKCkge1xuICAgICAgY2IobnVsbCwgZmlsZXMpIC8vIGRlemFsZ29cbiAgICB9KVxuICAgIGVsc2UgY2IobnVsbCwgZmlsZXMpXG4gIH0pXG59XG5cbmZ1bmN0aW9uIGdldEZpbGVzIChwYXRoLCBrZWVwUm9vdCwgY2IpIHtcbiAgdHJhdmVyc2VQYXRoKGdldEZpbGVJbmZvLCBwYXRoLCBmdW5jdGlvbiAoZXJyLCBmaWxlcykge1xuICAgICAgaWYgKGVycikgcmV0dXJuIGNiKGVycilcblxuICAgICAgaWYgKEFycmF5LmlzQXJyYXkoZmlsZXMpKSBmaWxlcyA9IGZsYXR0ZW4oZmlsZXMpXG4gICAgICBlbHNlIGZpbGVzID0gWyBmaWxlcyBdXG5cbiAgICAgIHZhciBkaXJOYW1lID0gY29yZVBhdGgubm9ybWFsaXplKHBhdGgpXG4gICAgICBpZiAoa2VlcFJvb3QgfHwgZmlsZXMubGVuZ3RoID09PSAxKSB7XG4gICAgICAgIGRpck5hbWUgPSBkaXJOYW1lLnNsaWNlKDAsIGRpck5hbWUubGFzdEluZGV4T2YoY29yZVBhdGguc2VwKSArIDEpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAoZGlyTmFtZVtkaXJOYW1lLmxlbmd0aCAtIDFdICE9PSBjb3JlUGF0aC5zZXApIGRpck5hbWUgKz0gY29yZVBhdGguc2VwXG4gICAgICB9XG5cbiAgICAgIGZpbGVzLmZvckVhY2goZnVuY3Rpb24gKGZpbGUpIHtcbiAgICAgICAgZmlsZS5nZXRTdHJlYW0gPSBnZXRGaWxlUGF0aFN0cmVhbShmaWxlLnBhdGgpXG4gICAgICAgIGZpbGUucGF0aCA9IGZpbGUucGF0aC5yZXBsYWNlKGRpck5hbWUsICcnKS5zcGxpdChjb3JlUGF0aC5zZXApXG4gICAgICB9KVxuXG4gICAgICBjYihudWxsLCBmaWxlcylcbiAgICB9KVxufVxuXG5mdW5jdGlvbiBnZXRGaWxlSW5mbyAocGF0aCwgY2IpIHtcbiAgY2IgPSBvbmNlKGNiKVxuICBmcy5zdGF0KHBhdGgsIGZ1bmN0aW9uIChlcnIsIHN0YXQpIHtcbiAgICBpZiAoZXJyKSByZXR1cm4gY2IoZXJyKVxuICAgIHZhciBpbmZvID0ge1xuICAgICAgbGVuZ3RoOiBzdGF0LnNpemUsXG4gICAgICBwYXRoOiBwYXRoXG4gICAgfVxuICAgIGNiKG51bGwsIGluZm8pXG4gIH0pXG59XG5cbmZ1bmN0aW9uIHRyYXZlcnNlUGF0aCAoZm4sIHBhdGgsIGNiKSB7XG4gIGZzLnJlYWRkaXIocGF0aCwgZnVuY3Rpb24gKGVyciwgZW50cmllcykge1xuICAgIGlmIChlcnIgJiYgZXJyLmNvZGUgPT09ICdFTk9URElSJykge1xuICAgICAgLy8gdGhpcyBpcyBhIGZpbGVcbiAgICAgIGZuKHBhdGgsIGNiKVxuICAgIH0gZWxzZSBpZiAoZXJyKSB7XG4gICAgICAvLyByZWFsIGVycm9yXG4gICAgICBjYihlcnIpXG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIHRoaXMgaXMgYSBmb2xkZXJcbiAgICAgIHBhcmFsbGVsKGVudHJpZXMubWFwKGZ1bmN0aW9uIChlbnRyeSkge1xuICAgICAgICByZXR1cm4gZnVuY3Rpb24gKGNiKSB7XG4gICAgICAgICAgdHJhdmVyc2VQYXRoKGZuLCBjb3JlUGF0aC5qb2luKHBhdGgsIGVudHJ5KSwgY2IpXG4gICAgICAgIH1cbiAgICAgIH0pLCBjYilcbiAgICB9XG4gIH0pXG59XG5cbmZ1bmN0aW9uIGdldFBpZWNlTGlzdCAoZmlsZXMsIHBpZWNlTGVuZ3RoLCBjYikge1xuICBjYiA9IG9uY2UoY2IpXG4gIHZhciBwaWVjZXMgPSBbXVxuICB2YXIgbGVuZ3RoID0gMFxuXG4gIHZhciBzdHJlYW1zID0gZmlsZXMubWFwKGZ1bmN0aW9uIChmaWxlKSB7XG4gICAgcmV0dXJuIGZpbGUuZ2V0U3RyZWFtXG4gIH0pXG5cbiAgdmFyIHJlbWFpbmluZ0hhc2hlcyA9IDBcbiAgdmFyIHBpZWNlTnVtID0gMFxuICB2YXIgZW5kZWQgPSBmYWxzZVxuXG4gIG5ldyBNdWx0aVN0cmVhbShzdHJlYW1zKVxuICAgIC5waXBlKG5ldyBCbG9ja1N0cmVhbShwaWVjZUxlbmd0aCwgeyBub3BhZDogdHJ1ZSB9KSlcbiAgICAub24oJ2RhdGEnLCBmdW5jdGlvbiAoY2h1bmspIHtcbiAgICAgIGxlbmd0aCArPSBjaHVuay5sZW5ndGhcblxuICAgICAgdmFyIGkgPSBwaWVjZU51bVxuICAgICAgc2hhMShjaHVuaywgZnVuY3Rpb24gKGhhc2gpIHtcbiAgICAgICAgcGllY2VzW2ldID0gaGFzaFxuICAgICAgICByZW1haW5pbmdIYXNoZXMgLT0gMVxuICAgICAgICBtYXliZURvbmUoKVxuICAgICAgfSlcbiAgICAgIHJlbWFpbmluZ0hhc2hlcyArPSAxXG4gICAgICBwaWVjZU51bSArPSAxXG4gICAgfSlcbiAgICAub24oJ2VuZCcsIGZ1bmN0aW9uICgpIHtcbiAgICAgIGVuZGVkID0gdHJ1ZVxuICAgICAgbWF5YmVEb25lKClcbiAgICB9KVxuICAgIC5vbignZXJyb3InLCBjYilcblxuICBmdW5jdGlvbiBtYXliZURvbmUgKCkge1xuICAgIGlmIChlbmRlZCAmJiByZW1haW5pbmdIYXNoZXMgPT09IDApXG4gICAgICBjYihudWxsLCBuZXcgQnVmZmVyKHBpZWNlcy5qb2luKCcnKSwgJ2hleCcpLCBsZW5ndGgpXG4gIH1cbn1cblxuZnVuY3Rpb24gb25GaWxlcyAoZmlsZXMsIG9wdHMsIGNiKSB7XG4gIHZhciBhbm5vdW5jZUxpc3QgPSBvcHRzLmFubm91bmNlTGlzdCAhPT0gdW5kZWZpbmVkXG4gICAgPyBvcHRzLmFubm91bmNlTGlzdFxuICAgIDogb3B0cy5hbm5vdW5jZSAhPT0gdW5kZWZpbmVkXG4gICAgICA/IG9wdHMuYW5ub3VuY2UubWFwKGZ1bmN0aW9uICh1KSB7IHJldHVybiBbIHUgXSB9KVxuICAgICAgOiBtb2R1bGUuZXhwb3J0cy5hbm5vdW5jZUxpc3QgLy8gZGVmYXVsdFxuXG4gIHZhciB0b3JyZW50ID0ge1xuICAgIGluZm86IHtcbiAgICAgIG5hbWU6IG9wdHMubmFtZVxuICAgIH0sXG4gICAgYW5ub3VuY2U6IGFubm91bmNlTGlzdFswXVswXSxcbiAgICAnYW5ub3VuY2UtbGlzdCc6IGFubm91bmNlTGlzdCxcbiAgICAnY3JlYXRpb24gZGF0ZSc6IE51bWJlcihvcHRzLmNyZWF0aW9uRGF0ZSkgfHwgRGF0ZS5ub3coKSxcbiAgICBlbmNvZGluZzogJ1VURi04J1xuICB9XG5cbiAgaWYgKG9wdHMuY29tbWVudCAhPT0gdW5kZWZpbmVkKVxuICAgIHRvcnJlbnQuaW5mby5jb21tZW50ID0gb3B0cy5jb21tZW50XG5cbiAgaWYgKG9wdHMuY3JlYXRlZEJ5ICE9PSB1bmRlZmluZWQpXG4gICAgdG9ycmVudC5pbmZvWydjcmVhdGVkIGJ5J10gPSBvcHRzLmNyZWF0ZWRCeVxuXG4gIGlmIChvcHRzLnByaXZhdGUgIT09IHVuZGVmaW5lZClcbiAgICB0b3JyZW50LmluZm8ucHJpdmF0ZSA9IE51bWJlcihvcHRzLnByaXZhdGUpXG5cbiAgLy8gXCJzc2wtY2VydFwiIGtleSBpcyBmb3IgU1NMIHRvcnJlbnRzLCBzZWU6XG4gIC8vICAgLSBodHRwOi8vYmxvZy5saWJ0b3JyZW50Lm9yZy8yMDEyLzAxL2JpdHRvcnJlbnQtb3Zlci1zc2wvXG4gIC8vICAgLSBodHRwOi8vd3d3LmxpYnRvcnJlbnQub3JnL21hbnVhbC1yZWYuaHRtbCNzc2wtdG9ycmVudHNcbiAgLy8gICAtIGh0dHA6Ly93d3cubGlidG9ycmVudC5vcmcvcmVmZXJlbmNlLUNyZWF0ZV9Ub3JyZW50cy5odG1sXG4gIGlmIChvcHRzLnNzbENlcnQgIT09IHVuZGVmaW5lZClcbiAgICB0b3JyZW50LmluZm9bJ3NzbC1jZXJ0J10gPSBvcHRzLnNzbENlcnRcblxuICBpZiAob3B0cy51cmxMaXN0ICE9PSB1bmRlZmluZWQpXG4gICAgdG9ycmVudFsndXJsLWxpc3QnXSA9IG9wdHMudXJsTGlzdFxuXG4gIHZhciBzaW5nbGVGaWxlID0gZmlsZXMubGVuZ3RoID09PSAxXG5cbiAgdmFyIHBpZWNlTGVuZ3RoID0gb3B0cy5waWVjZUxlbmd0aCB8fCBjYWxjUGllY2VMZW5ndGgoZmlsZXMucmVkdWNlKHN1bUxlbmd0aCwgMCkpXG4gIHRvcnJlbnQuaW5mb1sncGllY2UgbGVuZ3RoJ10gPSBwaWVjZUxlbmd0aFxuXG4gIGdldFBpZWNlTGlzdChmaWxlcywgcGllY2VMZW5ndGgsIGZ1bmN0aW9uIChlcnIsIHBpZWNlcywgdG9ycmVudExlbmd0aCkge1xuICAgIGlmIChlcnIpIHJldHVybiBjYihlcnIpXG4gICAgdG9ycmVudC5pbmZvLnBpZWNlcyA9IHBpZWNlc1xuXG4gICAgZmlsZXMuZm9yRWFjaChmdW5jdGlvbiAoZmlsZSkge1xuICAgICAgZGVsZXRlIGZpbGUuZ2V0U3RyZWFtXG4gICAgfSlcblxuICAgIGlmICghc2luZ2xlRmlsZSkge1xuICAgICAgdG9ycmVudC5pbmZvLmZpbGVzID0gZmlsZXNcbiAgICB9IGVsc2Uge1xuICAgICAgdG9ycmVudC5pbmZvLmxlbmd0aCA9IHRvcnJlbnRMZW5ndGhcbiAgICB9XG5cbiAgICBjYihudWxsLCBiZW5jb2RlLmVuY29kZSh0b3JyZW50KSlcbiAgfSlcbn1cblxuLyoqXG4gKiBBY2N1bXVsYXRvciB0byBzdW0gZmlsZSBsZW5ndGhzXG4gKiBAcGFyYW0gIHtudW1iZXJ9IHN1bVxuICogQHBhcmFtICB7T2JqZWN0fSBmaWxlXG4gKiBAcmV0dXJuIHtudW1iZXJ9XG4gKi9cbmZ1bmN0aW9uIHN1bUxlbmd0aCAoc3VtLCBmaWxlKSB7XG4gIHJldHVybiBzdW0gKyBmaWxlLmxlbmd0aFxufVxuXG4vKipcbiAqIENoZWNrIGlmIGBvYmpgIGlzIGEgVzNDIGBCbG9iYCBvYmplY3QgKHdoaWNoIGBGaWxlYCBpbmhlcml0cyBmcm9tKVxuICogQHBhcmFtICB7Kn0gb2JqXG4gKiBAcmV0dXJuIHtib29sZWFufVxuICovXG5mdW5jdGlvbiBpc0Jsb2IgKG9iaikge1xuICByZXR1cm4gdHlwZW9mIEJsb2IgIT09ICd1bmRlZmluZWQnICYmIG9iaiBpbnN0YW5jZW9mIEJsb2Jcbn1cblxuLyoqXG4gKiBDaGVjayBpZiBgb2JqYCBpcyBhIFczQyBgRmlsZUxpc3RgIG9iamVjdFxuICogQHBhcmFtICB7Kn0gb2JqXG4gKiBAcmV0dXJuIHtib29sZWFufVxuICovXG5mdW5jdGlvbiBpc0ZpbGVMaXN0IChvYmopIHtcbiAgcmV0dXJuIHR5cGVvZiBGaWxlTGlzdCA9PT0gJ2Z1bmN0aW9uJyAmJiBvYmogaW5zdGFuY2VvZiBGaWxlTGlzdFxufVxuXG4vKipcbiAqIENoZWNrIGlmIGBvYmpgIGlzIGEgbm9kZSBSZWFkYWJsZSBzdHJlYW1cbiAqIEBwYXJhbSAgeyp9IG9ialxuICogQHJldHVybiB7Ym9vbGVhbn1cbiAqL1xuZnVuY3Rpb24gaXNSZWFkYWJsZSAob2JqKSB7XG4gIHJldHVybiB0eXBlb2Ygb2JqID09PSAnb2JqZWN0JyAmJiB0eXBlb2Ygb2JqLnBpcGUgPT09ICdmdW5jdGlvbidcbn1cblxuLyoqXG4gKiBDb252ZXJ0IGEgYEZpbGVgIHRvIGEgbGF6eSByZWFkYWJsZSBzdHJlYW0uXG4gKiBAcGFyYW0gIHtGaWxlfEJsb2J9IGZpbGVcbiAqIEByZXR1cm4ge2Z1bmN0aW9ufVxuICovXG5mdW5jdGlvbiBnZXRCbG9iU3RyZWFtIChmaWxlKSB7XG4gIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIG5ldyBGaWxlUmVhZFN0cmVhbShmaWxlKVxuICB9XG59XG5cbi8qKlxuICogQ29udmVydCBhIGBCdWZmZXJgIHRvIGEgbGF6eSByZWFkYWJsZSBzdHJlYW0uXG4gKiBAcGFyYW0gIHtCdWZmZXJ9IGJ1ZmZlclxuICogQHJldHVybiB7ZnVuY3Rpb259XG4gKi9cbmZ1bmN0aW9uIGdldEJ1ZmZlclN0cmVhbSAoYnVmZmVyKSB7XG4gIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHMgPSBuZXcgc3RyZWFtLlBhc3NUaHJvdWdoKClcbiAgICBzLmVuZChidWZmZXIpXG4gICAgcmV0dXJuIHNcbiAgfVxufVxuXG4vKipcbiAqIENvbnZlcnQgYSBmaWxlIHBhdGggdG8gYSBsYXp5IHJlYWRhYmxlIHN0cmVhbS5cbiAqIEBwYXJhbSAge3N0cmluZ30gcGF0aFxuICogQHJldHVybiB7ZnVuY3Rpb259XG4gKi9cbmZ1bmN0aW9uIGdldEZpbGVQYXRoU3RyZWFtIChwYXRoKSB7XG4gIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIGZzLmNyZWF0ZVJlYWRTdHJlYW0ocGF0aClcbiAgfVxufVxuXG4vKipcbiAqIENvbnZlcnQgYSByZWFkYWJsZSBzdHJlYW0gdG8gYSBsYXp5IHJlYWRhYmxlIHN0cmVhbS4gQWRkcyBpbnN0cnVtZW50YXRpb24gdG8gdHJhY2tcbiAqIHRoZSBudW1iZXIgb2YgYnl0ZXMgaW4gdGhlIHN0cmVhbSBhbmQgc2V0IGBmaWxlLmxlbmd0aGAuXG4gKlxuICogQHBhcmFtICB7U3RyZWFtfSBzdHJlYW1cbiAqIEBwYXJhbSAge09iamVjdH0gZmlsZVxuICogQHJldHVybiB7ZnVuY3Rpb259XG4gKi9cbmZ1bmN0aW9uIGdldFN0cmVhbVN0cmVhbSAoc3RyZWFtLCBmaWxlKSB7XG4gIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIGNvdW50ZXIgPSBuZXcgVHJhbnNmb3JtKClcbiAgICBjb3VudGVyLl90cmFuc2Zvcm0gPSBmdW5jdGlvbiAoYnVmLCBlbmMsIGRvbmUpIHtcbiAgICAgIGZpbGUubGVuZ3RoICs9IGJ1Zi5sZW5ndGhcbiAgICAgIHRoaXMucHVzaChidWYpXG4gICAgICBkb25lKClcbiAgICB9XG4gICAgc3RyZWFtLnBpcGUoY291bnRlcilcbiAgICByZXR1cm4gY291bnRlclxuICB9XG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IHtcbiAgZW5jb2RlOiByZXF1aXJlKCAnLi9saWIvZW5jb2RlJyApLFxuICBkZWNvZGU6IHJlcXVpcmUoICcuL2xpYi9kZWNvZGUnIClcbn1cbiIsInZhciBEaWN0ID0gcmVxdWlyZShcIi4vZGljdFwiKVxuXG4vKipcbiAqIERlY29kZXMgYmVuY29kZWQgZGF0YS5cbiAqXG4gKiBAcGFyYW0gIHtCdWZmZXJ9IGRhdGFcbiAqIEBwYXJhbSAge1N0cmluZ30gZW5jb2RpbmdcbiAqIEByZXR1cm4ge09iamVjdHxBcnJheXxCdWZmZXJ8U3RyaW5nfE51bWJlcn1cbiAqL1xuZnVuY3Rpb24gZGVjb2RlKCBkYXRhLCBlbmNvZGluZyApIHtcblxuICBkZWNvZGUucG9zaXRpb24gPSAwXG4gIGRlY29kZS5lbmNvZGluZyA9IGVuY29kaW5nIHx8IG51bGxcblxuICBkZWNvZGUuZGF0YSA9ICEoIEJ1ZmZlci5pc0J1ZmZlcihkYXRhKSApXG4gICAgPyBuZXcgQnVmZmVyKCBkYXRhIClcbiAgICA6IGRhdGFcblxuICByZXR1cm4gZGVjb2RlLm5leHQoKVxuXG59XG5cbmRlY29kZS5wb3NpdGlvbiA9IDBcbmRlY29kZS5kYXRhICAgICA9IG51bGxcbmRlY29kZS5lbmNvZGluZyA9IG51bGxcblxuZGVjb2RlLm5leHQgPSBmdW5jdGlvbigpIHtcblxuICBzd2l0Y2goIGRlY29kZS5kYXRhW2RlY29kZS5wb3NpdGlvbl0gKSB7XG4gICAgY2FzZSAweDY0OiByZXR1cm4gZGVjb2RlLmRpY3Rpb25hcnkoKTsgYnJlYWtcbiAgICBjYXNlIDB4NkM6IHJldHVybiBkZWNvZGUubGlzdCgpOyBicmVha1xuICAgIGNhc2UgMHg2OTogcmV0dXJuIGRlY29kZS5pbnRlZ2VyKCk7IGJyZWFrXG4gICAgZGVmYXVsdDogICByZXR1cm4gZGVjb2RlLmJ5dGVzKCk7IGJyZWFrXG4gIH1cblxufVxuXG5kZWNvZGUuZmluZCA9IGZ1bmN0aW9uKCBjaHIgKSB7XG5cbiAgdmFyIGkgPSBkZWNvZGUucG9zaXRpb25cbiAgdmFyIGMgPSBkZWNvZGUuZGF0YS5sZW5ndGhcbiAgdmFyIGQgPSBkZWNvZGUuZGF0YVxuXG4gIHdoaWxlKCBpIDwgYyApIHtcbiAgICBpZiggZFtpXSA9PT0gY2hyIClcbiAgICAgIHJldHVybiBpXG4gICAgaSsrXG4gIH1cblxuICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgJ0ludmFsaWQgZGF0YTogTWlzc2luZyBkZWxpbWl0ZXIgXCInICtcbiAgICBTdHJpbmcuZnJvbUNoYXJDb2RlKCBjaHIgKSArICdcIiBbMHgnICtcbiAgICBjaHIudG9TdHJpbmcoIDE2ICkgKyAnXSdcbiAgKVxuXG59XG5cbmRlY29kZS5kaWN0aW9uYXJ5ID0gZnVuY3Rpb24oKSB7XG5cbiAgZGVjb2RlLnBvc2l0aW9uKytcblxuICB2YXIgZGljdCA9IG5ldyBEaWN0KClcblxuICB3aGlsZSggZGVjb2RlLmRhdGFbZGVjb2RlLnBvc2l0aW9uXSAhPT0gMHg2NSApIHtcbiAgICBkaWN0LmJpbmFyeVNldChkZWNvZGUuYnl0ZXMoKSwgZGVjb2RlLm5leHQoKSlcbiAgfVxuXG4gIGRlY29kZS5wb3NpdGlvbisrXG5cbiAgcmV0dXJuIGRpY3RcblxufVxuXG5kZWNvZGUubGlzdCA9IGZ1bmN0aW9uKCkge1xuXG4gIGRlY29kZS5wb3NpdGlvbisrXG5cbiAgdmFyIGxzdCA9IFtdXG5cbiAgd2hpbGUoIGRlY29kZS5kYXRhW2RlY29kZS5wb3NpdGlvbl0gIT09IDB4NjUgKSB7XG4gICAgbHN0LnB1c2goIGRlY29kZS5uZXh0KCkgKVxuICB9XG5cbiAgZGVjb2RlLnBvc2l0aW9uKytcblxuICByZXR1cm4gbHN0XG5cbn1cblxuZGVjb2RlLmludGVnZXIgPSBmdW5jdGlvbigpIHtcblxuICB2YXIgZW5kICAgID0gZGVjb2RlLmZpbmQoIDB4NjUgKVxuICB2YXIgbnVtYmVyID0gZGVjb2RlLmRhdGEudG9TdHJpbmcoICdhc2NpaScsIGRlY29kZS5wb3NpdGlvbiArIDEsIGVuZCApXG5cbiAgZGVjb2RlLnBvc2l0aW9uICs9IGVuZCArIDEgLSBkZWNvZGUucG9zaXRpb25cblxuICByZXR1cm4gcGFyc2VJbnQoIG51bWJlciwgMTAgKVxuXG59XG5cbmRlY29kZS5ieXRlcyA9IGZ1bmN0aW9uKCkge1xuXG4gIHZhciBzZXAgICAgPSBkZWNvZGUuZmluZCggMHgzQSApXG4gIHZhciBsZW5ndGggPSBwYXJzZUludCggZGVjb2RlLmRhdGEudG9TdHJpbmcoICdhc2NpaScsIGRlY29kZS5wb3NpdGlvbiwgc2VwICksIDEwIClcbiAgdmFyIGVuZCAgICA9ICsrc2VwICsgbGVuZ3RoXG5cbiAgZGVjb2RlLnBvc2l0aW9uID0gZW5kXG5cbiAgcmV0dXJuIGRlY29kZS5lbmNvZGluZ1xuICAgID8gZGVjb2RlLmRhdGEudG9TdHJpbmcoIGRlY29kZS5lbmNvZGluZywgc2VwLCBlbmQgKVxuICAgIDogZGVjb2RlLmRhdGEuc2xpY2UoIHNlcCwgZW5kIClcblxufVxuXG4vLyBFeHBvcnRzXG5tb2R1bGUuZXhwb3J0cyA9IGRlY29kZVxuIiwidmFyIERpY3QgPSBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIERpY3QoKSB7XG4gIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh0aGlzLCBcIl9rZXlzXCIsIHtcbiAgICBlbnVtZXJhYmxlOiBmYWxzZSxcbiAgICB2YWx1ZTogW10sXG4gIH0pXG59XG5cbkRpY3QucHJvdG90eXBlLmJpbmFyeUtleXMgPSBmdW5jdGlvbiBiaW5hcnlLZXlzKCkge1xuICByZXR1cm4gdGhpcy5fa2V5cy5zbGljZSgpXG59XG5cbkRpY3QucHJvdG90eXBlLmJpbmFyeVNldCA9IGZ1bmN0aW9uIGJpbmFyeVNldChrZXksIHZhbHVlKSB7XG4gIHRoaXMuX2tleXMucHVzaChrZXkpXG5cbiAgdGhpc1trZXldID0gdmFsdWVcbn1cbiIsIi8qKlxuICogRW5jb2RlcyBkYXRhIGluIGJlbmNvZGUuXG4gKlxuICogQHBhcmFtICB7QnVmZmVyfEFycmF5fFN0cmluZ3xPYmplY3R8TnVtYmVyfSBkYXRhXG4gKiBAcmV0dXJuIHtCdWZmZXJ9XG4gKi9cbmZ1bmN0aW9uIGVuY29kZSggZGF0YSApIHtcbiAgdmFyIGJ1ZmZlcnMgPSBbXVxuICBlbmNvZGUuX2VuY29kZSggYnVmZmVycywgZGF0YSApXG4gIHJldHVybiBCdWZmZXIuY29uY2F0KCBidWZmZXJzIClcbn1cblxuZW5jb2RlLl9mbG9hdENvbnZlcnNpb25EZXRlY3RlZCA9IGZhbHNlXG5cbmVuY29kZS5fZW5jb2RlID0gZnVuY3Rpb24oIGJ1ZmZlcnMsIGRhdGEgKSB7XG5cbiAgaWYoIEJ1ZmZlci5pc0J1ZmZlcihkYXRhKSApIHtcbiAgICBidWZmZXJzLnB1c2gobmV3IEJ1ZmZlcihkYXRhLmxlbmd0aCArICc6JykpXG4gICAgYnVmZmVycy5wdXNoKGRhdGEpXG4gICAgcmV0dXJuO1xuICB9XG5cbiAgc3dpdGNoKCB0eXBlb2YgZGF0YSApIHtcbiAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgZW5jb2RlLmJ5dGVzKCBidWZmZXJzLCBkYXRhIClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgIGVuY29kZS5udW1iZXIoIGJ1ZmZlcnMsIGRhdGEgKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICdvYmplY3QnOlxuICAgICAgZGF0YS5jb25zdHJ1Y3RvciA9PT0gQXJyYXlcbiAgICAgICAgPyBlbmNvZGUubGlzdCggYnVmZmVycywgZGF0YSApXG4gICAgICAgIDogZW5jb2RlLmRpY3QoIGJ1ZmZlcnMsIGRhdGEgKVxuICAgICAgYnJlYWtcbiAgfVxuXG59XG5cbnZhciBidWZmX2UgPSBuZXcgQnVmZmVyKCdlJylcbiAgLCBidWZmX2QgPSBuZXcgQnVmZmVyKCdkJylcbiAgLCBidWZmX2wgPSBuZXcgQnVmZmVyKCdsJylcblxuZW5jb2RlLmJ5dGVzID0gZnVuY3Rpb24oIGJ1ZmZlcnMsIGRhdGEgKSB7XG5cbiAgYnVmZmVycy5wdXNoKCBuZXcgQnVmZmVyKEJ1ZmZlci5ieXRlTGVuZ3RoKCBkYXRhICkgKyAnOicgKyBkYXRhKSApXG59XG5cbmVuY29kZS5udW1iZXIgPSBmdW5jdGlvbiggYnVmZmVycywgZGF0YSApIHtcbiAgdmFyIG1heExvID0gMHg4MDAwMDAwMFxuICB2YXIgaGkgPSAoIGRhdGEgLyBtYXhMbyApIDw8IDBcbiAgdmFyIGxvID0gKCBkYXRhICUgbWF4TG8gICkgPDwgMFxuICB2YXIgdmFsID0gaGkgKiBtYXhMbyArIGxvXG5cbiAgYnVmZmVycy5wdXNoKCBuZXcgQnVmZmVyKCAnaScgKyB2YWwgKyAnZScgKSlcblxuICBpZiggdmFsICE9PSBkYXRhICYmICFlbmNvZGUuX2Zsb2F0Q29udmVyc2lvbkRldGVjdGVkICkge1xuICAgIGVuY29kZS5fZmxvYXRDb252ZXJzaW9uRGV0ZWN0ZWQgPSB0cnVlXG4gICAgY29uc29sZS53YXJuKFxuICAgICAgJ1dBUk5JTkc6IFBvc3NpYmxlIGRhdGEgY29ycnVwdGlvbiBkZXRlY3RlZCB3aXRoIHZhbHVlIFwiJytkYXRhKydcIjonLFxuICAgICAgJ0JlbmNvZGluZyBvbmx5IGRlZmluZXMgc3VwcG9ydCBmb3IgaW50ZWdlcnMsIHZhbHVlIHdhcyBjb252ZXJ0ZWQgdG8gXCInK3ZhbCsnXCInXG4gICAgKVxuICAgIGNvbnNvbGUudHJhY2UoKVxuICB9XG5cbn1cblxuZW5jb2RlLmRpY3QgPSBmdW5jdGlvbiggYnVmZmVycywgZGF0YSApIHtcblxuICBidWZmZXJzLnB1c2goIGJ1ZmZfZCApXG5cbiAgdmFyIGogPSAwXG4gIHZhciBrXG4gIC8vIGZpeCBmb3IgaXNzdWUgIzEzIC0gc29ydGVkIGRpY3RzXG4gIHZhciBrZXlzID0gT2JqZWN0LmtleXMoIGRhdGEgKS5zb3J0KClcbiAgdmFyIGtsID0ga2V5cy5sZW5ndGhcblxuICBmb3IoIDsgaiA8IGtsIDsgaisrKSB7XG4gICAgaz1rZXlzW2pdXG4gICAgZW5jb2RlLmJ5dGVzKCBidWZmZXJzLCBrIClcbiAgICBlbmNvZGUuX2VuY29kZSggYnVmZmVycywgZGF0YVtrXSApXG4gIH1cblxuICBidWZmZXJzLnB1c2goIGJ1ZmZfZSApXG59XG5cbmVuY29kZS5saXN0ID0gZnVuY3Rpb24oIGJ1ZmZlcnMsIGRhdGEgKSB7XG5cbiAgdmFyIGkgPSAwLCBqID0gMVxuICB2YXIgYyA9IGRhdGEubGVuZ3RoXG4gIGJ1ZmZlcnMucHVzaCggYnVmZl9sIClcblxuICBmb3IoIDsgaSA8IGM7IGkrKyApIHtcbiAgICBlbmNvZGUuX2VuY29kZSggYnVmZmVycywgZGF0YVtpXSApXG4gIH1cblxuICBidWZmZXJzLnB1c2goIGJ1ZmZfZSApXG5cbn1cblxuLy8gRXhwb3NlXG5tb2R1bGUuZXhwb3J0cyA9IGVuY29kZVxuIiwiLyoqXG4gKiBDb252ZXJ0IGEgdHlwZWQgYXJyYXkgdG8gYSBCdWZmZXIgd2l0aG91dCBhIGNvcHlcbiAqXG4gKiBBdXRob3I6ICAgRmVyb3NzIEFib3VraGFkaWplaCA8ZmVyb3NzQGZlcm9zcy5vcmc+IDxodHRwOi8vZmVyb3NzLm9yZz5cbiAqIExpY2Vuc2U6ICBNSVRcbiAqXG4gKiBgbnBtIGluc3RhbGwgdHlwZWRhcnJheS10by1idWZmZXJgXG4gKi9cblxudmFyIGlzVHlwZWRBcnJheSA9IHJlcXVpcmUoJ2lzLXR5cGVkYXJyYXknKS5zdHJpY3RcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoYXJyKSB7XG4gIC8vIElmIGBCdWZmZXJgIGlzIHRoZSBicm93c2VyIGBidWZmZXJgIG1vZHVsZSwgYW5kIHRoZSBicm93c2VyIHN1cHBvcnRzIHR5cGVkIGFycmF5cyxcbiAgLy8gdGhlbiBhdm9pZCBhIGNvcHkuIE90aGVyd2lzZSwgY3JlYXRlIGEgYEJ1ZmZlcmAgd2l0aCBhIGNvcHkuXG4gIHZhciBjb25zdHJ1Y3RvciA9IEJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUXG4gICAgPyBCdWZmZXIuX2F1Z21lbnRcbiAgICA6IGZ1bmN0aW9uIChhcnIpIHsgcmV0dXJuIG5ldyBCdWZmZXIoYXJyKSB9XG5cbiAgaWYgKGFyciBpbnN0YW5jZW9mIFVpbnQ4QXJyYXkpIHtcbiAgICByZXR1cm4gY29uc3RydWN0b3IoYXJyKVxuICB9IGVsc2UgaWYgKGFyciBpbnN0YW5jZW9mIEFycmF5QnVmZmVyKSB7XG4gICAgcmV0dXJuIGNvbnN0cnVjdG9yKG5ldyBVaW50OEFycmF5KGFycikpXG4gIH0gZWxzZSBpZiAoaXNUeXBlZEFycmF5KGFycikpIHtcbiAgICAvLyBVc2UgdGhlIHR5cGVkIGFycmF5J3MgdW5kZXJseWluZyBBcnJheUJ1ZmZlciB0byBiYWNrIG5ldyBCdWZmZXIuIFRoaXMgcmVzcGVjdHNcbiAgICAvLyB0aGUgXCJ2aWV3XCIgb24gdGhlIEFycmF5QnVmZmVyLCBpLmUuIGJ5dGVPZmZzZXQgYW5kIGJ5dGVMZW5ndGguIE5vIGNvcHkuXG4gICAgcmV0dXJuIGNvbnN0cnVjdG9yKG5ldyBVaW50OEFycmF5KGFyci5idWZmZXIsIGFyci5ieXRlT2Zmc2V0LCBhcnIuYnl0ZUxlbmd0aCkpXG4gIH0gZWxzZSB7XG4gICAgLy8gVW5zdXBwb3J0ZWQgdHlwZSwganVzdCBwYXNzIGl0IHRocm91Z2ggdG8gdGhlIGBCdWZmZXJgIGNvbnN0cnVjdG9yLlxuICAgIHJldHVybiBuZXcgQnVmZmVyKGFycilcbiAgfVxufVxuIiwibW9kdWxlLmV4cG9ydHMgICAgICA9IGlzVHlwZWRBcnJheVxuaXNUeXBlZEFycmF5LnN0cmljdCA9IGlzU3RyaWN0VHlwZWRBcnJheVxuaXNUeXBlZEFycmF5Lmxvb3NlICA9IGlzTG9vc2VUeXBlZEFycmF5XG5cbnZhciB0b1N0cmluZyA9IE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmdcbnZhciBuYW1lcyA9IHtcbiAgICAnW29iamVjdCBJbnQ4QXJyYXldJzogdHJ1ZVxuICAsICdbb2JqZWN0IEludDE2QXJyYXldJzogdHJ1ZVxuICAsICdbb2JqZWN0IEludDMyQXJyYXldJzogdHJ1ZVxuICAsICdbb2JqZWN0IFVpbnQ4QXJyYXldJzogdHJ1ZVxuICAsICdbb2JqZWN0IFVpbnQxNkFycmF5XSc6IHRydWVcbiAgLCAnW29iamVjdCBVaW50MzJBcnJheV0nOiB0cnVlXG4gICwgJ1tvYmplY3QgRmxvYXQzMkFycmF5XSc6IHRydWVcbiAgLCAnW29iamVjdCBGbG9hdDY0QXJyYXldJzogdHJ1ZVxufVxuXG5mdW5jdGlvbiBpc1R5cGVkQXJyYXkoYXJyKSB7XG4gIHJldHVybiAoXG4gICAgICAgaXNTdHJpY3RUeXBlZEFycmF5KGFycilcbiAgICB8fCBpc0xvb3NlVHlwZWRBcnJheShhcnIpXG4gIClcbn1cblxuZnVuY3Rpb24gaXNTdHJpY3RUeXBlZEFycmF5KGFycikge1xuICByZXR1cm4gKFxuICAgICAgIGFyciBpbnN0YW5jZW9mIEludDhBcnJheVxuICAgIHx8IGFyciBpbnN0YW5jZW9mIEludDE2QXJyYXlcbiAgICB8fCBhcnIgaW5zdGFuY2VvZiBJbnQzMkFycmF5XG4gICAgfHwgYXJyIGluc3RhbmNlb2YgVWludDhBcnJheVxuICAgIHx8IGFyciBpbnN0YW5jZW9mIFVpbnQxNkFycmF5XG4gICAgfHwgYXJyIGluc3RhbmNlb2YgVWludDMyQXJyYXlcbiAgICB8fCBhcnIgaW5zdGFuY2VvZiBGbG9hdDMyQXJyYXlcbiAgICB8fCBhcnIgaW5zdGFuY2VvZiBGbG9hdDY0QXJyYXlcbiAgKVxufVxuXG5mdW5jdGlvbiBpc0xvb3NlVHlwZWRBcnJheShhcnIpIHtcbiAgcmV0dXJuIG5hbWVzW3RvU3RyaW5nLmNhbGwoYXJyKV1cbn1cbiIsInZhciBSZWFkYWJsZSA9IHJlcXVpcmUoJ3N0cmVhbScpLlJlYWRhYmxlO1xudmFyIGluaGVyaXRzID0gcmVxdWlyZSgnaW5oZXJpdHMnKTtcbnZhciByZUV4dGVuc2lvbiA9IC9eLipcXC4oXFx3KykkLztcbnZhciB0b0J1ZmZlciA9IHJlcXVpcmUoJ3R5cGVkYXJyYXktdG8tYnVmZmVyJyk7XG5cbmZ1bmN0aW9uIEZpbGVSZWFkU3RyZWFtKGZpbGUsIG9wdHMpIHtcbiAgdmFyIHJlYWRTdHJlYW0gPSB0aGlzO1xuICBpZiAoISAodGhpcyBpbnN0YW5jZW9mIEZpbGVSZWFkU3RyZWFtKSkge1xuICAgIHJldHVybiBuZXcgRmlsZVJlYWRTdHJlYW0oZmlsZSwgb3B0cyk7XG4gIH1cbiAgb3B0cyA9IG9wdHMgfHwge307XG5cbiAgLy8gaW5oZXJpdCByZWFkYWJsZVxuICBSZWFkYWJsZS5jYWxsKHRoaXMsIG9wdHMpO1xuXG4gIC8vIHNhdmUgdGhlIHJlYWQgb2Zmc2V0XG4gIHRoaXMuX29mZnNldCA9IDA7XG4gIHRoaXMuX2VvZiA9IGZhbHNlO1xuXG4gIC8vIGNyZWF0ZSB0aGUgcmVhZGVyXG4gIHRoaXMucmVhZGVyID0gbmV3IEZpbGVSZWFkZXIoKTtcbiAgdGhpcy5yZWFkZXIub25wcm9ncmVzcyA9IHRoaXMuX2hhbmRsZVByb2dyZXNzLmJpbmQodGhpcyk7XG4gIHRoaXMucmVhZGVyLm9ubG9hZCA9IHRoaXMuX2hhbmRsZUxvYWQuYmluZCh0aGlzKTtcblxuICAvLyBnZW5lcmF0ZSB0aGUgaGVhZGVyIGJsb2NrcyB0aGF0IHdlIHdpbGwgc2VuZCBhcyBwYXJ0IG9mIHRoZSBpbml0aWFsIHBheWxvYWRcbiAgdGhpcy5fZ2VuZXJhdGVIZWFkZXJCbG9ja3MoZmlsZSwgb3B0cywgZnVuY3Rpb24oZXJyLCBibG9ja3MpIHtcbiAgICAvLyBpZiB3ZSBlbmNvdW50ZXJlZCBhbiBlcnJvciwgZW1pdCBpdFxuICAgIGlmIChlcnIpIHtcbiAgICAgIHJldHVybiByZWFkU3RyZWFtLmVtaXQoJ2Vycm9yJywgZXJyKTtcbiAgICB9XG5cbiAgICByZWFkU3RyZWFtLl9oZWFkZXJCbG9ja3MgPSBibG9ja3MgfHwgW107XG4gICAgcmVhZFN0cmVhbS5yZWFkZXIucmVhZEFzQXJyYXlCdWZmZXIoZmlsZSk7XG4gIH0pO1xufVxuXG5pbmhlcml0cyhGaWxlUmVhZFN0cmVhbSwgUmVhZGFibGUpO1xubW9kdWxlLmV4cG9ydHMgPSBGaWxlUmVhZFN0cmVhbTtcblxuRmlsZVJlYWRTdHJlYW0ucHJvdG90eXBlLl9nZW5lcmF0ZUhlYWRlckJsb2NrcyA9IGZ1bmN0aW9uKGZpbGUsIG9wdHMsIGNhbGxiYWNrKSB7XG4gIGNhbGxiYWNrKG51bGwsIFtdKTtcbn07XG5cbkZpbGVSZWFkU3RyZWFtLnByb3RvdHlwZS5fcmVhZCA9IGZ1bmN0aW9uKGJ5dGVzKSB7XG4gIHZhciBzdHJlYW0gPSB0aGlzO1xuICB2YXIgcmVhZGVyID0gdGhpcy5yZWFkZXI7XG5cbiAgZnVuY3Rpb24gY2hlY2tCeXRlcygpIHtcbiAgICB2YXIgc3RhcnRPZmZzZXQgPSBzdHJlYW0uX29mZnNldDtcbiAgICB2YXIgZW5kT2Zmc2V0ID0gc3RyZWFtLl9vZmZzZXQgKyBieXRlcztcbiAgICB2YXIgYXZhaWxhYmxlQnl0ZXMgPSByZWFkZXIucmVzdWx0ICYmIHJlYWRlci5yZXN1bHQuYnl0ZUxlbmd0aDtcbiAgICB2YXIgZG9uZSA9IHJlYWRlci5yZWFkeVN0YXRlID09PSAyICYmIGVuZE9mZnNldCA+IGF2YWlsYWJsZUJ5dGVzO1xuICAgIHZhciBjaHVuaztcblxuICAgIC8vIGNvbnNvbGUubG9nKCdjaGVja2luZyBieXRlcyBhdmFpbGFibGUsIG5lZWQ6ICcgKyBlbmRPZmZzZXQgKyAnLCBnb3Q6ICcgKyBhdmFpbGFibGVCeXRlcyk7XG4gICAgaWYgKGF2YWlsYWJsZUJ5dGVzICYmIChkb25lIHx8IGF2YWlsYWJsZUJ5dGVzID4gZW5kT2Zmc2V0KSkge1xuICAgICAgLy8gZ2V0IHRoZSBkYXRhIGNodW5rXG4gICAgICBjaHVuayA9IHRvQnVmZmVyKG5ldyBVaW50OEFycmF5KFxuICAgICAgICByZWFkZXIucmVzdWx0LFxuICAgICAgICBzdGFydE9mZnNldCxcbiAgICAgICAgTWF0aC5taW4oYnl0ZXMsIHJlYWRlci5yZXN1bHQuYnl0ZUxlbmd0aCAtIHN0YXJ0T2Zmc2V0KVxuICAgICAgKSk7XG5cbiAgICAgIC8vIHVwZGF0ZSB0aGUgc3RyZWFtIG9mZnNldFxuICAgICAgc3RyZWFtLl9vZmZzZXQgPSBzdGFydE9mZnNldCArIGNodW5rLmxlbmd0aDtcblxuICAgICAgLy8gc2VuZCB0aGUgY2h1bmtcbiAgICAgIC8vIGNvbnNvbGUubG9nKCdzZW5kaW5nIGNodW5rLCBlbmRlZDogJywgY2h1bmsubGVuZ3RoID09PSAwKTtcbiAgICAgIHN0cmVhbS5fZW9mID0gY2h1bmsubGVuZ3RoID09PSAwO1xuICAgICAgcmV0dXJuIHN0cmVhbS5wdXNoKGNodW5rLmxlbmd0aCA+IDAgPyBjaHVuayA6IG51bGwpO1xuICAgIH1cblxuICAgIHN0cmVhbS5vbmNlKCdyZWFkYWJsZScsIGNoZWNrQnl0ZXMpO1xuICB9XG5cbiAgLy8gcHVzaCB0aGUgaGVhZGVyIGJsb2NrcyBvdXQgdG8gdGhlIHN0cmVhbVxuICBpZiAodGhpcy5faGVhZGVyQmxvY2tzLmxlbmd0aCA+IDApIHtcbiAgICByZXR1cm4gdGhpcy5wdXNoKHRoaXMuX2hlYWRlckJsb2Nrcy5zaGlmdCgpKTtcbiAgfVxuXG4gIGNoZWNrQnl0ZXMoKTtcbn07XG5cbkZpbGVSZWFkU3RyZWFtLnByb3RvdHlwZS5faGFuZGxlTG9hZCA9IGZ1bmN0aW9uKGV2dCkge1xuICB0aGlzLmVtaXQoJ3JlYWRhYmxlJyk7XG59O1xuXG5GaWxlUmVhZFN0cmVhbS5wcm90b3R5cGUuX2hhbmRsZVByb2dyZXNzID0gZnVuY3Rpb24oZXZ0KSB7XG4gIHRoaXMuZW1pdCgncmVhZGFibGUnKTtcbn07XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGZsYXR0ZW4obGlzdCwgZGVwdGgpIHtcbiAgZGVwdGggPSAodHlwZW9mIGRlcHRoID09ICdudW1iZXInKSA/IGRlcHRoIDogSW5maW5pdHk7XG5cbiAgcmV0dXJuIF9mbGF0dGVuKGxpc3QsIDEpO1xuXG4gIGZ1bmN0aW9uIF9mbGF0dGVuKGxpc3QsIGQpIHtcbiAgICByZXR1cm4gbGlzdC5yZWR1Y2UoZnVuY3Rpb24gKGFjYywgaXRlbSkge1xuICAgICAgaWYgKEFycmF5LmlzQXJyYXkoaXRlbSkgJiYgZCA8IGRlcHRoKSB7XG4gICAgICAgIHJldHVybiBhY2MuY29uY2F0KF9mbGF0dGVuKGl0ZW0sIGQgKyAxKSk7XG4gICAgICB9XG4gICAgICBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGFjYy5jb25jYXQoaXRlbSk7XG4gICAgICB9XG4gICAgfSwgW10pO1xuICB9XG59O1xuIiwidmFyIGNsb3Nlc3QgPSByZXF1aXJlKCdjbG9zZXN0LXRvJylcblxuLy8gQ3JlYXRlIGEgcmFuZ2UgZnJvbSAxNmti4oCTNG1iXG52YXIgc2l6ZXMgPSBbXVxuZm9yICh2YXIgaSA9IDE0OyBpIDw9IDIyOyBpKyspIHtcbiAgc2l6ZXMucHVzaChNYXRoLnBvdygyLCBpKSlcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihzaXplKSB7XG4gIHJldHVybiBjbG9zZXN0KFxuICAgIHNpemUgLyBNYXRoLnBvdygyLCAxMCksIHNpemVzIFxuICApXG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHRhcmdldCwgbnVtYmVycykge1xuICB2YXIgY2xvc2VzdCA9IEluZmluaXR5XG4gIHZhciBkaWZmZXJlbmNlID0gMFxuICB2YXIgd2lubmVyID0gbnVsbFxuXG4gIG51bWJlcnMuc29ydChmdW5jdGlvbihhLCBiKSB7XG4gICAgcmV0dXJuIGEgLSBiXG4gIH0pXG5cbiAgZm9yICh2YXIgaSA9IDAsIGwgPSBudW1iZXJzLmxlbmd0aDsgaSA8IGw7IGkrKykgeyAgXG4gICAgZGlmZmVyZW5jZSA9IE1hdGguYWJzKHRhcmdldCAtIG51bWJlcnNbaV0pXG4gICAgaWYgKGRpZmZlcmVuY2UgPj0gY2xvc2VzdCkge1xuICAgICAgYnJlYWtcbiAgICB9XG4gICAgY2xvc2VzdCA9IGRpZmZlcmVuY2VcbiAgICB3aW5uZXIgPSBudW1iZXJzW2ldXG4gIH1cblxuICByZXR1cm4gd2lubmVyXG59XG4iLCJcbi8qKlxuICogVGhpcyBpcyB0aGUgd2ViIGJyb3dzZXIgaW1wbGVtZW50YXRpb24gb2YgYGRlYnVnKClgLlxuICpcbiAqIEV4cG9zZSBgZGVidWcoKWAgYXMgdGhlIG1vZHVsZS5cbiAqL1xuXG5leHBvcnRzID0gbW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKCcuL2RlYnVnJyk7XG5leHBvcnRzLmxvZyA9IGxvZztcbmV4cG9ydHMuZm9ybWF0QXJncyA9IGZvcm1hdEFyZ3M7XG5leHBvcnRzLnNhdmUgPSBzYXZlO1xuZXhwb3J0cy5sb2FkID0gbG9hZDtcbmV4cG9ydHMudXNlQ29sb3JzID0gdXNlQ29sb3JzO1xuXG4vKipcbiAqIFVzZSBjaHJvbWUuc3RvcmFnZS5sb2NhbCBpZiB3ZSBhcmUgaW4gYW4gYXBwXG4gKi9cblxudmFyIHN0b3JhZ2U7XG5cbmlmICh0eXBlb2YgY2hyb21lICE9PSAndW5kZWZpbmVkJyAmJiB0eXBlb2YgY2hyb21lLnN0b3JhZ2UgIT09ICd1bmRlZmluZWQnKVxuICBzdG9yYWdlID0gY2hyb21lLnN0b3JhZ2UubG9jYWw7XG5lbHNlXG4gIHN0b3JhZ2UgPSBsb2NhbHN0b3JhZ2UoKTtcblxuLyoqXG4gKiBDb2xvcnMuXG4gKi9cblxuZXhwb3J0cy5jb2xvcnMgPSBbXG4gICdsaWdodHNlYWdyZWVuJyxcbiAgJ2ZvcmVzdGdyZWVuJyxcbiAgJ2dvbGRlbnJvZCcsXG4gICdkb2RnZXJibHVlJyxcbiAgJ2RhcmtvcmNoaWQnLFxuICAnY3JpbXNvbidcbl07XG5cbi8qKlxuICogQ3VycmVudGx5IG9ubHkgV2ViS2l0LWJhc2VkIFdlYiBJbnNwZWN0b3JzLCBGaXJlZm94ID49IHYzMSxcbiAqIGFuZCB0aGUgRmlyZWJ1ZyBleHRlbnNpb24gKGFueSBGaXJlZm94IHZlcnNpb24pIGFyZSBrbm93blxuICogdG8gc3VwcG9ydCBcIiVjXCIgQ1NTIGN1c3RvbWl6YXRpb25zLlxuICpcbiAqIFRPRE86IGFkZCBhIGBsb2NhbFN0b3JhZ2VgIHZhcmlhYmxlIHRvIGV4cGxpY2l0bHkgZW5hYmxlL2Rpc2FibGUgY29sb3JzXG4gKi9cblxuZnVuY3Rpb24gdXNlQ29sb3JzKCkge1xuICAvLyBpcyB3ZWJraXQ/IGh0dHA6Ly9zdGFja292ZXJmbG93LmNvbS9hLzE2NDU5NjA2LzM3Njc3M1xuICByZXR1cm4gKCdXZWJraXRBcHBlYXJhbmNlJyBpbiBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuc3R5bGUpIHx8XG4gICAgLy8gaXMgZmlyZWJ1Zz8gaHR0cDovL3N0YWNrb3ZlcmZsb3cuY29tL2EvMzk4MTIwLzM3Njc3M1xuICAgICh3aW5kb3cuY29uc29sZSAmJiAoY29uc29sZS5maXJlYnVnIHx8IChjb25zb2xlLmV4Y2VwdGlvbiAmJiBjb25zb2xlLnRhYmxlKSkpIHx8XG4gICAgLy8gaXMgZmlyZWZveCA+PSB2MzE/XG4gICAgLy8gaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9Ub29scy9XZWJfQ29uc29sZSNTdHlsaW5nX21lc3NhZ2VzXG4gICAgKG5hdmlnYXRvci51c2VyQWdlbnQudG9Mb3dlckNhc2UoKS5tYXRjaCgvZmlyZWZveFxcLyhcXGQrKS8pICYmIHBhcnNlSW50KFJlZ0V4cC4kMSwgMTApID49IDMxKTtcbn1cblxuLyoqXG4gKiBNYXAgJWogdG8gYEpTT04uc3RyaW5naWZ5KClgLCBzaW5jZSBubyBXZWIgSW5zcGVjdG9ycyBkbyB0aGF0IGJ5IGRlZmF1bHQuXG4gKi9cblxuZXhwb3J0cy5mb3JtYXR0ZXJzLmogPSBmdW5jdGlvbih2KSB7XG4gIHJldHVybiBKU09OLnN0cmluZ2lmeSh2KTtcbn07XG5cblxuLyoqXG4gKiBDb2xvcml6ZSBsb2cgYXJndW1lbnRzIGlmIGVuYWJsZWQuXG4gKlxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBmb3JtYXRBcmdzKCkge1xuICB2YXIgYXJncyA9IGFyZ3VtZW50cztcbiAgdmFyIHVzZUNvbG9ycyA9IHRoaXMudXNlQ29sb3JzO1xuXG4gIGFyZ3NbMF0gPSAodXNlQ29sb3JzID8gJyVjJyA6ICcnKVxuICAgICsgdGhpcy5uYW1lc3BhY2VcbiAgICArICh1c2VDb2xvcnMgPyAnICVjJyA6ICcgJylcbiAgICArIGFyZ3NbMF1cbiAgICArICh1c2VDb2xvcnMgPyAnJWMgJyA6ICcgJylcbiAgICArICcrJyArIGV4cG9ydHMuaHVtYW5pemUodGhpcy5kaWZmKTtcblxuICBpZiAoIXVzZUNvbG9ycykgcmV0dXJuIGFyZ3M7XG5cbiAgdmFyIGMgPSAnY29sb3I6ICcgKyB0aGlzLmNvbG9yO1xuICBhcmdzID0gW2FyZ3NbMF0sIGMsICdjb2xvcjogaW5oZXJpdCddLmNvbmNhdChBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmdzLCAxKSk7XG5cbiAgLy8gdGhlIGZpbmFsIFwiJWNcIiBpcyBzb21ld2hhdCB0cmlja3ksIGJlY2F1c2UgdGhlcmUgY291bGQgYmUgb3RoZXJcbiAgLy8gYXJndW1lbnRzIHBhc3NlZCBlaXRoZXIgYmVmb3JlIG9yIGFmdGVyIHRoZSAlYywgc28gd2UgbmVlZCB0b1xuICAvLyBmaWd1cmUgb3V0IHRoZSBjb3JyZWN0IGluZGV4IHRvIGluc2VydCB0aGUgQ1NTIGludG9cbiAgdmFyIGluZGV4ID0gMDtcbiAgdmFyIGxhc3RDID0gMDtcbiAgYXJnc1swXS5yZXBsYWNlKC8lW2EteiVdL2csIGZ1bmN0aW9uKG1hdGNoKSB7XG4gICAgaWYgKCclJScgPT09IG1hdGNoKSByZXR1cm47XG4gICAgaW5kZXgrKztcbiAgICBpZiAoJyVjJyA9PT0gbWF0Y2gpIHtcbiAgICAgIC8vIHdlIG9ubHkgYXJlIGludGVyZXN0ZWQgaW4gdGhlICpsYXN0KiAlY1xuICAgICAgLy8gKHRoZSB1c2VyIG1heSBoYXZlIHByb3ZpZGVkIHRoZWlyIG93bilcbiAgICAgIGxhc3RDID0gaW5kZXg7XG4gICAgfVxuICB9KTtcblxuICBhcmdzLnNwbGljZShsYXN0QywgMCwgYyk7XG4gIHJldHVybiBhcmdzO1xufVxuXG4vKipcbiAqIEludm9rZXMgYGNvbnNvbGUubG9nKClgIHdoZW4gYXZhaWxhYmxlLlxuICogTm8tb3Agd2hlbiBgY29uc29sZS5sb2dgIGlzIG5vdCBhIFwiZnVuY3Rpb25cIi5cbiAqXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIGxvZygpIHtcbiAgLy8gdGhpcyBoYWNrZXJ5IGlzIHJlcXVpcmVkIGZvciBJRTgvOSwgd2hlcmVcbiAgLy8gdGhlIGBjb25zb2xlLmxvZ2AgZnVuY3Rpb24gZG9lc24ndCBoYXZlICdhcHBseSdcbiAgcmV0dXJuICdvYmplY3QnID09PSB0eXBlb2YgY29uc29sZVxuICAgICYmIGNvbnNvbGUubG9nXG4gICAgJiYgRnVuY3Rpb24ucHJvdG90eXBlLmFwcGx5LmNhbGwoY29uc29sZS5sb2csIGNvbnNvbGUsIGFyZ3VtZW50cyk7XG59XG5cbi8qKlxuICogU2F2ZSBgbmFtZXNwYWNlc2AuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWVzcGFjZXNcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIHNhdmUobmFtZXNwYWNlcykge1xuICB0cnkge1xuICAgIGlmIChudWxsID09IG5hbWVzcGFjZXMpIHtcbiAgICAgIHN0b3JhZ2UucmVtb3ZlSXRlbSgnZGVidWcnKTtcbiAgICB9IGVsc2Uge1xuICAgICAgc3RvcmFnZS5kZWJ1ZyA9IG5hbWVzcGFjZXM7XG4gICAgfVxuICB9IGNhdGNoKGUpIHt9XG59XG5cbi8qKlxuICogTG9hZCBgbmFtZXNwYWNlc2AuXG4gKlxuICogQHJldHVybiB7U3RyaW5nfSByZXR1cm5zIHRoZSBwcmV2aW91c2x5IHBlcnNpc3RlZCBkZWJ1ZyBtb2Rlc1xuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gbG9hZCgpIHtcbiAgdmFyIHI7XG4gIHRyeSB7XG4gICAgciA9IHN0b3JhZ2UuZGVidWc7XG4gIH0gY2F0Y2goZSkge31cbiAgcmV0dXJuIHI7XG59XG5cbi8qKlxuICogRW5hYmxlIG5hbWVzcGFjZXMgbGlzdGVkIGluIGBsb2NhbFN0b3JhZ2UuZGVidWdgIGluaXRpYWxseS5cbiAqL1xuXG5leHBvcnRzLmVuYWJsZShsb2FkKCkpO1xuXG4vKipcbiAqIExvY2Fsc3RvcmFnZSBhdHRlbXB0cyB0byByZXR1cm4gdGhlIGxvY2Fsc3RvcmFnZS5cbiAqXG4gKiBUaGlzIGlzIG5lY2Vzc2FyeSBiZWNhdXNlIHNhZmFyaSB0aHJvd3NcbiAqIHdoZW4gYSB1c2VyIGRpc2FibGVzIGNvb2tpZXMvbG9jYWxzdG9yYWdlXG4gKiBhbmQgeW91IGF0dGVtcHQgdG8gYWNjZXNzIGl0LlxuICpcbiAqIEByZXR1cm4ge0xvY2FsU3RvcmFnZX1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIGxvY2Fsc3RvcmFnZSgpe1xuICB0cnkge1xuICAgIHJldHVybiB3aW5kb3cubG9jYWxTdG9yYWdlO1xuICB9IGNhdGNoIChlKSB7fVxufVxuIiwiXG4vKipcbiAqIFRoaXMgaXMgdGhlIGNvbW1vbiBsb2dpYyBmb3IgYm90aCB0aGUgTm9kZS5qcyBhbmQgd2ViIGJyb3dzZXJcbiAqIGltcGxlbWVudGF0aW9ucyBvZiBgZGVidWcoKWAuXG4gKlxuICogRXhwb3NlIGBkZWJ1ZygpYCBhcyB0aGUgbW9kdWxlLlxuICovXG5cbmV4cG9ydHMgPSBtb2R1bGUuZXhwb3J0cyA9IGRlYnVnO1xuZXhwb3J0cy5jb2VyY2UgPSBjb2VyY2U7XG5leHBvcnRzLmRpc2FibGUgPSBkaXNhYmxlO1xuZXhwb3J0cy5lbmFibGUgPSBlbmFibGU7XG5leHBvcnRzLmVuYWJsZWQgPSBlbmFibGVkO1xuZXhwb3J0cy5odW1hbml6ZSA9IHJlcXVpcmUoJ21zJyk7XG5cbi8qKlxuICogVGhlIGN1cnJlbnRseSBhY3RpdmUgZGVidWcgbW9kZSBuYW1lcywgYW5kIG5hbWVzIHRvIHNraXAuXG4gKi9cblxuZXhwb3J0cy5uYW1lcyA9IFtdO1xuZXhwb3J0cy5za2lwcyA9IFtdO1xuXG4vKipcbiAqIE1hcCBvZiBzcGVjaWFsIFwiJW5cIiBoYW5kbGluZyBmdW5jdGlvbnMsIGZvciB0aGUgZGVidWcgXCJmb3JtYXRcIiBhcmd1bWVudC5cbiAqXG4gKiBWYWxpZCBrZXkgbmFtZXMgYXJlIGEgc2luZ2xlLCBsb3dlcmNhc2VkIGxldHRlciwgaS5lLiBcIm5cIi5cbiAqL1xuXG5leHBvcnRzLmZvcm1hdHRlcnMgPSB7fTtcblxuLyoqXG4gKiBQcmV2aW91c2x5IGFzc2lnbmVkIGNvbG9yLlxuICovXG5cbnZhciBwcmV2Q29sb3IgPSAwO1xuXG4vKipcbiAqIFByZXZpb3VzIGxvZyB0aW1lc3RhbXAuXG4gKi9cblxudmFyIHByZXZUaW1lO1xuXG4vKipcbiAqIFNlbGVjdCBhIGNvbG9yLlxuICpcbiAqIEByZXR1cm4ge051bWJlcn1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIHNlbGVjdENvbG9yKCkge1xuICByZXR1cm4gZXhwb3J0cy5jb2xvcnNbcHJldkNvbG9yKysgJSBleHBvcnRzLmNvbG9ycy5sZW5ndGhdO1xufVxuXG4vKipcbiAqIENyZWF0ZSBhIGRlYnVnZ2VyIHdpdGggdGhlIGdpdmVuIGBuYW1lc3BhY2VgLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lc3BhY2VcbiAqIEByZXR1cm4ge0Z1bmN0aW9ufVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBkZWJ1ZyhuYW1lc3BhY2UpIHtcblxuICAvLyBkZWZpbmUgdGhlIGBkaXNhYmxlZGAgdmVyc2lvblxuICBmdW5jdGlvbiBkaXNhYmxlZCgpIHtcbiAgfVxuICBkaXNhYmxlZC5lbmFibGVkID0gZmFsc2U7XG5cbiAgLy8gZGVmaW5lIHRoZSBgZW5hYmxlZGAgdmVyc2lvblxuICBmdW5jdGlvbiBlbmFibGVkKCkge1xuXG4gICAgdmFyIHNlbGYgPSBlbmFibGVkO1xuXG4gICAgLy8gc2V0IGBkaWZmYCB0aW1lc3RhbXBcbiAgICB2YXIgY3VyciA9ICtuZXcgRGF0ZSgpO1xuICAgIHZhciBtcyA9IGN1cnIgLSAocHJldlRpbWUgfHwgY3Vycik7XG4gICAgc2VsZi5kaWZmID0gbXM7XG4gICAgc2VsZi5wcmV2ID0gcHJldlRpbWU7XG4gICAgc2VsZi5jdXJyID0gY3VycjtcbiAgICBwcmV2VGltZSA9IGN1cnI7XG5cbiAgICAvLyBhZGQgdGhlIGBjb2xvcmAgaWYgbm90IHNldFxuICAgIGlmIChudWxsID09IHNlbGYudXNlQ29sb3JzKSBzZWxmLnVzZUNvbG9ycyA9IGV4cG9ydHMudXNlQ29sb3JzKCk7XG4gICAgaWYgKG51bGwgPT0gc2VsZi5jb2xvciAmJiBzZWxmLnVzZUNvbG9ycykgc2VsZi5jb2xvciA9IHNlbGVjdENvbG9yKCk7XG5cbiAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cyk7XG5cbiAgICBhcmdzWzBdID0gZXhwb3J0cy5jb2VyY2UoYXJnc1swXSk7XG5cbiAgICBpZiAoJ3N0cmluZycgIT09IHR5cGVvZiBhcmdzWzBdKSB7XG4gICAgICAvLyBhbnl0aGluZyBlbHNlIGxldCdzIGluc3BlY3Qgd2l0aCAlb1xuICAgICAgYXJncyA9IFsnJW8nXS5jb25jYXQoYXJncyk7XG4gICAgfVxuXG4gICAgLy8gYXBwbHkgYW55IGBmb3JtYXR0ZXJzYCB0cmFuc2Zvcm1hdGlvbnNcbiAgICB2YXIgaW5kZXggPSAwO1xuICAgIGFyZ3NbMF0gPSBhcmdzWzBdLnJlcGxhY2UoLyUoW2EteiVdKS9nLCBmdW5jdGlvbihtYXRjaCwgZm9ybWF0KSB7XG4gICAgICAvLyBpZiB3ZSBlbmNvdW50ZXIgYW4gZXNjYXBlZCAlIHRoZW4gZG9uJ3QgaW5jcmVhc2UgdGhlIGFycmF5IGluZGV4XG4gICAgICBpZiAobWF0Y2ggPT09ICclJScpIHJldHVybiBtYXRjaDtcbiAgICAgIGluZGV4Kys7XG4gICAgICB2YXIgZm9ybWF0dGVyID0gZXhwb3J0cy5mb3JtYXR0ZXJzW2Zvcm1hdF07XG4gICAgICBpZiAoJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIGZvcm1hdHRlcikge1xuICAgICAgICB2YXIgdmFsID0gYXJnc1tpbmRleF07XG4gICAgICAgIG1hdGNoID0gZm9ybWF0dGVyLmNhbGwoc2VsZiwgdmFsKTtcblxuICAgICAgICAvLyBub3cgd2UgbmVlZCB0byByZW1vdmUgYGFyZ3NbaW5kZXhdYCBzaW5jZSBpdCdzIGlubGluZWQgaW4gdGhlIGBmb3JtYXRgXG4gICAgICAgIGFyZ3Muc3BsaWNlKGluZGV4LCAxKTtcbiAgICAgICAgaW5kZXgtLTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBtYXRjaDtcbiAgICB9KTtcblxuICAgIGlmICgnZnVuY3Rpb24nID09PSB0eXBlb2YgZXhwb3J0cy5mb3JtYXRBcmdzKSB7XG4gICAgICBhcmdzID0gZXhwb3J0cy5mb3JtYXRBcmdzLmFwcGx5KHNlbGYsIGFyZ3MpO1xuICAgIH1cbiAgICB2YXIgbG9nRm4gPSBlbmFibGVkLmxvZyB8fCBleHBvcnRzLmxvZyB8fCBjb25zb2xlLmxvZy5iaW5kKGNvbnNvbGUpO1xuICAgIGxvZ0ZuLmFwcGx5KHNlbGYsIGFyZ3MpO1xuICB9XG4gIGVuYWJsZWQuZW5hYmxlZCA9IHRydWU7XG5cbiAgdmFyIGZuID0gZXhwb3J0cy5lbmFibGVkKG5hbWVzcGFjZSkgPyBlbmFibGVkIDogZGlzYWJsZWQ7XG5cbiAgZm4ubmFtZXNwYWNlID0gbmFtZXNwYWNlO1xuXG4gIHJldHVybiBmbjtcbn1cblxuLyoqXG4gKiBFbmFibGVzIGEgZGVidWcgbW9kZSBieSBuYW1lc3BhY2VzLiBUaGlzIGNhbiBpbmNsdWRlIG1vZGVzXG4gKiBzZXBhcmF0ZWQgYnkgYSBjb2xvbiBhbmQgd2lsZGNhcmRzLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lc3BhY2VzXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIGVuYWJsZShuYW1lc3BhY2VzKSB7XG4gIGV4cG9ydHMuc2F2ZShuYW1lc3BhY2VzKTtcblxuICB2YXIgc3BsaXQgPSAobmFtZXNwYWNlcyB8fCAnJykuc3BsaXQoL1tcXHMsXSsvKTtcbiAgdmFyIGxlbiA9IHNwbGl0Lmxlbmd0aDtcblxuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgaWYgKCFzcGxpdFtpXSkgY29udGludWU7IC8vIGlnbm9yZSBlbXB0eSBzdHJpbmdzXG4gICAgbmFtZXNwYWNlcyA9IHNwbGl0W2ldLnJlcGxhY2UoL1xcKi9nLCAnLio/Jyk7XG4gICAgaWYgKG5hbWVzcGFjZXNbMF0gPT09ICctJykge1xuICAgICAgZXhwb3J0cy5za2lwcy5wdXNoKG5ldyBSZWdFeHAoJ14nICsgbmFtZXNwYWNlcy5zdWJzdHIoMSkgKyAnJCcpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgZXhwb3J0cy5uYW1lcy5wdXNoKG5ldyBSZWdFeHAoJ14nICsgbmFtZXNwYWNlcyArICckJykpO1xuICAgIH1cbiAgfVxufVxuXG4vKipcbiAqIERpc2FibGUgZGVidWcgb3V0cHV0LlxuICpcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gZGlzYWJsZSgpIHtcbiAgZXhwb3J0cy5lbmFibGUoJycpO1xufVxuXG4vKipcbiAqIFJldHVybnMgdHJ1ZSBpZiB0aGUgZ2l2ZW4gbW9kZSBuYW1lIGlzIGVuYWJsZWQsIGZhbHNlIG90aGVyd2lzZS5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZVxuICogQHJldHVybiB7Qm9vbGVhbn1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gZW5hYmxlZChuYW1lKSB7XG4gIHZhciBpLCBsZW47XG4gIGZvciAoaSA9IDAsIGxlbiA9IGV4cG9ydHMuc2tpcHMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICBpZiAoZXhwb3J0cy5za2lwc1tpXS50ZXN0KG5hbWUpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG4gIGZvciAoaSA9IDAsIGxlbiA9IGV4cG9ydHMubmFtZXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICBpZiAoZXhwb3J0cy5uYW1lc1tpXS50ZXN0KG5hbWUpKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGZhbHNlO1xufVxuXG4vKipcbiAqIENvZXJjZSBgdmFsYC5cbiAqXG4gKiBAcGFyYW0ge01peGVkfSB2YWxcbiAqIEByZXR1cm4ge01peGVkfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gY29lcmNlKHZhbCkge1xuICBpZiAodmFsIGluc3RhbmNlb2YgRXJyb3IpIHJldHVybiB2YWwuc3RhY2sgfHwgdmFsLm1lc3NhZ2U7XG4gIHJldHVybiB2YWw7XG59XG4iLCIvKipcbiAqIEhlbHBlcnMuXG4gKi9cblxudmFyIHMgPSAxMDAwO1xudmFyIG0gPSBzICogNjA7XG52YXIgaCA9IG0gKiA2MDtcbnZhciBkID0gaCAqIDI0O1xudmFyIHkgPSBkICogMzY1LjI1O1xuXG4vKipcbiAqIFBhcnNlIG9yIGZvcm1hdCB0aGUgZ2l2ZW4gYHZhbGAuXG4gKlxuICogT3B0aW9uczpcbiAqXG4gKiAgLSBgbG9uZ2AgdmVyYm9zZSBmb3JtYXR0aW5nIFtmYWxzZV1cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ3xOdW1iZXJ9IHZhbFxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnNcbiAqIEByZXR1cm4ge1N0cmluZ3xOdW1iZXJ9XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24odmFsLCBvcHRpb25zKXtcbiAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gIGlmICgnc3RyaW5nJyA9PSB0eXBlb2YgdmFsKSByZXR1cm4gcGFyc2UodmFsKTtcbiAgcmV0dXJuIG9wdGlvbnMubG9uZ1xuICAgID8gbG9uZyh2YWwpXG4gICAgOiBzaG9ydCh2YWwpO1xufTtcblxuLyoqXG4gKiBQYXJzZSB0aGUgZ2l2ZW4gYHN0cmAgYW5kIHJldHVybiBtaWxsaXNlY29uZHMuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHN0clxuICogQHJldHVybiB7TnVtYmVyfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gcGFyc2Uoc3RyKSB7XG4gIHZhciBtYXRjaCA9IC9eKCg/OlxcZCspP1xcLj9cXGQrKSAqKG1pbGxpc2Vjb25kcz98bXNlY3M/fG1zfHNlY29uZHM/fHNlY3M/fHN8bWludXRlcz98bWlucz98bXxob3Vycz98aHJzP3xofGRheXM/fGR8eWVhcnM/fHlycz98eSk/JC9pLmV4ZWMoc3RyKTtcbiAgaWYgKCFtYXRjaCkgcmV0dXJuO1xuICB2YXIgbiA9IHBhcnNlRmxvYXQobWF0Y2hbMV0pO1xuICB2YXIgdHlwZSA9IChtYXRjaFsyXSB8fCAnbXMnKS50b0xvd2VyQ2FzZSgpO1xuICBzd2l0Y2ggKHR5cGUpIHtcbiAgICBjYXNlICd5ZWFycyc6XG4gICAgY2FzZSAneWVhcic6XG4gICAgY2FzZSAneXJzJzpcbiAgICBjYXNlICd5cic6XG4gICAgY2FzZSAneSc6XG4gICAgICByZXR1cm4gbiAqIHk7XG4gICAgY2FzZSAnZGF5cyc6XG4gICAgY2FzZSAnZGF5JzpcbiAgICBjYXNlICdkJzpcbiAgICAgIHJldHVybiBuICogZDtcbiAgICBjYXNlICdob3Vycyc6XG4gICAgY2FzZSAnaG91cic6XG4gICAgY2FzZSAnaHJzJzpcbiAgICBjYXNlICdocic6XG4gICAgY2FzZSAnaCc6XG4gICAgICByZXR1cm4gbiAqIGg7XG4gICAgY2FzZSAnbWludXRlcyc6XG4gICAgY2FzZSAnbWludXRlJzpcbiAgICBjYXNlICdtaW5zJzpcbiAgICBjYXNlICdtaW4nOlxuICAgIGNhc2UgJ20nOlxuICAgICAgcmV0dXJuIG4gKiBtO1xuICAgIGNhc2UgJ3NlY29uZHMnOlxuICAgIGNhc2UgJ3NlY29uZCc6XG4gICAgY2FzZSAnc2Vjcyc6XG4gICAgY2FzZSAnc2VjJzpcbiAgICBjYXNlICdzJzpcbiAgICAgIHJldHVybiBuICogcztcbiAgICBjYXNlICdtaWxsaXNlY29uZHMnOlxuICAgIGNhc2UgJ21pbGxpc2Vjb25kJzpcbiAgICBjYXNlICdtc2Vjcyc6XG4gICAgY2FzZSAnbXNlYyc6XG4gICAgY2FzZSAnbXMnOlxuICAgICAgcmV0dXJuIG47XG4gIH1cbn1cblxuLyoqXG4gKiBTaG9ydCBmb3JtYXQgZm9yIGBtc2AuXG4gKlxuICogQHBhcmFtIHtOdW1iZXJ9IG1zXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBzaG9ydChtcykge1xuICBpZiAobXMgPj0gZCkgcmV0dXJuIE1hdGgucm91bmQobXMgLyBkKSArICdkJztcbiAgaWYgKG1zID49IGgpIHJldHVybiBNYXRoLnJvdW5kKG1zIC8gaCkgKyAnaCc7XG4gIGlmIChtcyA+PSBtKSByZXR1cm4gTWF0aC5yb3VuZChtcyAvIG0pICsgJ20nO1xuICBpZiAobXMgPj0gcykgcmV0dXJuIE1hdGgucm91bmQobXMgLyBzKSArICdzJztcbiAgcmV0dXJuIG1zICsgJ21zJztcbn1cblxuLyoqXG4gKiBMb25nIGZvcm1hdCBmb3IgYG1zYC5cbiAqXG4gKiBAcGFyYW0ge051bWJlcn0gbXNcbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIGxvbmcobXMpIHtcbiAgcmV0dXJuIHBsdXJhbChtcywgZCwgJ2RheScpXG4gICAgfHwgcGx1cmFsKG1zLCBoLCAnaG91cicpXG4gICAgfHwgcGx1cmFsKG1zLCBtLCAnbWludXRlJylcbiAgICB8fCBwbHVyYWwobXMsIHMsICdzZWNvbmQnKVxuICAgIHx8IG1zICsgJyBtcyc7XG59XG5cbi8qKlxuICogUGx1cmFsaXphdGlvbiBoZWxwZXIuXG4gKi9cblxuZnVuY3Rpb24gcGx1cmFsKG1zLCBuLCBuYW1lKSB7XG4gIGlmIChtcyA8IG4pIHJldHVybjtcbiAgaWYgKG1zIDwgbiAqIDEuNSkgcmV0dXJuIE1hdGguZmxvb3IobXMgLyBuKSArICcgJyArIG5hbWU7XG4gIHJldHVybiBNYXRoLmNlaWwobXMgLyBuKSArICcgJyArIG5hbWUgKyAncyc7XG59XG4iLCJ2YXIgd3JhcHB5ID0gcmVxdWlyZSgnd3JhcHB5Jylcbm1vZHVsZS5leHBvcnRzID0gd3JhcHB5KGRlemFsZ28pXG5cbnZhciBhc2FwID0gcmVxdWlyZSgnYXNhcCcpXG5cbmZ1bmN0aW9uIGRlemFsZ28gKGNiKSB7XG4gIHZhciBzeW5jID0gdHJ1ZVxuICBhc2FwKGZ1bmN0aW9uICgpIHtcbiAgICBzeW5jID0gZmFsc2VcbiAgfSlcblxuICByZXR1cm4gZnVuY3Rpb24gemFsZ29TYWZlKCkge1xuICAgIHZhciBhcmdzID0gYXJndW1lbnRzXG4gICAgdmFyIG1lID0gdGhpc1xuICAgIGlmIChzeW5jKVxuICAgICAgYXNhcChmdW5jdGlvbigpIHtcbiAgICAgICAgY2IuYXBwbHkobWUsIGFyZ3MpXG4gICAgICB9KVxuICAgIGVsc2VcbiAgICAgIGNiLmFwcGx5KG1lLCBhcmdzKVxuICB9XG59XG4iLCJcbi8vIFVzZSB0aGUgZmFzdGVzdCBwb3NzaWJsZSBtZWFucyB0byBleGVjdXRlIGEgdGFzayBpbiBhIGZ1dHVyZSB0dXJuXG4vLyBvZiB0aGUgZXZlbnQgbG9vcC5cblxuLy8gbGlua2VkIGxpc3Qgb2YgdGFza3MgKHNpbmdsZSwgd2l0aCBoZWFkIG5vZGUpXG52YXIgaGVhZCA9IHt0YXNrOiB2b2lkIDAsIG5leHQ6IG51bGx9O1xudmFyIHRhaWwgPSBoZWFkO1xudmFyIGZsdXNoaW5nID0gZmFsc2U7XG52YXIgcmVxdWVzdEZsdXNoID0gdm9pZCAwO1xudmFyIGlzTm9kZUpTID0gZmFsc2U7XG5cbmZ1bmN0aW9uIGZsdXNoKCkge1xuICAgIC8qIGpzaGludCBsb29wZnVuYzogdHJ1ZSAqL1xuXG4gICAgd2hpbGUgKGhlYWQubmV4dCkge1xuICAgICAgICBoZWFkID0gaGVhZC5uZXh0O1xuICAgICAgICB2YXIgdGFzayA9IGhlYWQudGFzaztcbiAgICAgICAgaGVhZC50YXNrID0gdm9pZCAwO1xuICAgICAgICB2YXIgZG9tYWluID0gaGVhZC5kb21haW47XG5cbiAgICAgICAgaWYgKGRvbWFpbikge1xuICAgICAgICAgICAgaGVhZC5kb21haW4gPSB2b2lkIDA7XG4gICAgICAgICAgICBkb21haW4uZW50ZXIoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICB0YXNrKCk7XG5cbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgaWYgKGlzTm9kZUpTKSB7XG4gICAgICAgICAgICAgICAgLy8gSW4gbm9kZSwgdW5jYXVnaHQgZXhjZXB0aW9ucyBhcmUgY29uc2lkZXJlZCBmYXRhbCBlcnJvcnMuXG4gICAgICAgICAgICAgICAgLy8gUmUtdGhyb3cgdGhlbSBzeW5jaHJvbm91c2x5IHRvIGludGVycnVwdCBmbHVzaGluZyFcblxuICAgICAgICAgICAgICAgIC8vIEVuc3VyZSBjb250aW51YXRpb24gaWYgdGhlIHVuY2F1Z2h0IGV4Y2VwdGlvbiBpcyBzdXBwcmVzc2VkXG4gICAgICAgICAgICAgICAgLy8gbGlzdGVuaW5nIFwidW5jYXVnaHRFeGNlcHRpb25cIiBldmVudHMgKGFzIGRvbWFpbnMgZG9lcykuXG4gICAgICAgICAgICAgICAgLy8gQ29udGludWUgaW4gbmV4dCBldmVudCB0byBhdm9pZCB0aWNrIHJlY3Vyc2lvbi5cbiAgICAgICAgICAgICAgICBpZiAoZG9tYWluKSB7XG4gICAgICAgICAgICAgICAgICAgIGRvbWFpbi5leGl0KCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHNldFRpbWVvdXQoZmx1c2gsIDApO1xuICAgICAgICAgICAgICAgIGlmIChkb21haW4pIHtcbiAgICAgICAgICAgICAgICAgICAgZG9tYWluLmVudGVyKCk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgdGhyb3cgZTtcblxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBJbiBicm93c2VycywgdW5jYXVnaHQgZXhjZXB0aW9ucyBhcmUgbm90IGZhdGFsLlxuICAgICAgICAgICAgICAgIC8vIFJlLXRocm93IHRoZW0gYXN5bmNocm9ub3VzbHkgdG8gYXZvaWQgc2xvdy1kb3ducy5cbiAgICAgICAgICAgICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgIHRocm93IGU7XG4gICAgICAgICAgICAgICAgfSwgMCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoZG9tYWluKSB7XG4gICAgICAgICAgICBkb21haW4uZXhpdCgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZmx1c2hpbmcgPSBmYWxzZTtcbn1cblxuaWYgKHR5cGVvZiBwcm9jZXNzICE9PSBcInVuZGVmaW5lZFwiICYmIHByb2Nlc3MubmV4dFRpY2spIHtcbiAgICAvLyBOb2RlLmpzIGJlZm9yZSAwLjkuIE5vdGUgdGhhdCBzb21lIGZha2UtTm9kZSBlbnZpcm9ubWVudHMsIGxpa2UgdGhlXG4gICAgLy8gTW9jaGEgdGVzdCBydW5uZXIsIGludHJvZHVjZSBhIGBwcm9jZXNzYCBnbG9iYWwgd2l0aG91dCBhIGBuZXh0VGlja2AuXG4gICAgaXNOb2RlSlMgPSB0cnVlO1xuXG4gICAgcmVxdWVzdEZsdXNoID0gZnVuY3Rpb24gKCkge1xuICAgICAgICBwcm9jZXNzLm5leHRUaWNrKGZsdXNoKTtcbiAgICB9O1xuXG59IGVsc2UgaWYgKHR5cGVvZiBzZXRJbW1lZGlhdGUgPT09IFwiZnVuY3Rpb25cIikge1xuICAgIC8vIEluIElFMTAsIE5vZGUuanMgMC45Kywgb3IgaHR0cHM6Ly9naXRodWIuY29tL05vYmxlSlMvc2V0SW1tZWRpYXRlXG4gICAgaWYgKHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgICAgcmVxdWVzdEZsdXNoID0gc2V0SW1tZWRpYXRlLmJpbmQod2luZG93LCBmbHVzaCk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmVxdWVzdEZsdXNoID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgc2V0SW1tZWRpYXRlKGZsdXNoKTtcbiAgICAgICAgfTtcbiAgICB9XG5cbn0gZWxzZSBpZiAodHlwZW9mIE1lc3NhZ2VDaGFubmVsICE9PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgLy8gbW9kZXJuIGJyb3dzZXJzXG4gICAgLy8gaHR0cDovL3d3dy5ub25ibG9ja2luZy5pby8yMDExLzA2L3dpbmRvd25leHR0aWNrLmh0bWxcbiAgICB2YXIgY2hhbm5lbCA9IG5ldyBNZXNzYWdlQ2hhbm5lbCgpO1xuICAgIGNoYW5uZWwucG9ydDEub25tZXNzYWdlID0gZmx1c2g7XG4gICAgcmVxdWVzdEZsdXNoID0gZnVuY3Rpb24gKCkge1xuICAgICAgICBjaGFubmVsLnBvcnQyLnBvc3RNZXNzYWdlKDApO1xuICAgIH07XG5cbn0gZWxzZSB7XG4gICAgLy8gb2xkIGJyb3dzZXJzXG4gICAgcmVxdWVzdEZsdXNoID0gZnVuY3Rpb24gKCkge1xuICAgICAgICBzZXRUaW1lb3V0KGZsdXNoLCAwKTtcbiAgICB9O1xufVxuXG5mdW5jdGlvbiBhc2FwKHRhc2spIHtcbiAgICB0YWlsID0gdGFpbC5uZXh0ID0ge1xuICAgICAgICB0YXNrOiB0YXNrLFxuICAgICAgICBkb21haW46IGlzTm9kZUpTICYmIHByb2Nlc3MuZG9tYWluLFxuICAgICAgICBuZXh0OiBudWxsXG4gICAgfTtcblxuICAgIGlmICghZmx1c2hpbmcpIHtcbiAgICAgICAgZmx1c2hpbmcgPSB0cnVlO1xuICAgICAgICByZXF1ZXN0Rmx1c2goKTtcbiAgICB9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IGFzYXA7XG5cbiIsIi8vIFJldHVybnMgYSB3cmFwcGVyIGZ1bmN0aW9uIHRoYXQgcmV0dXJucyBhIHdyYXBwZWQgY2FsbGJhY2tcbi8vIFRoZSB3cmFwcGVyIGZ1bmN0aW9uIHNob3VsZCBkbyBzb21lIHN0dWZmLCBhbmQgcmV0dXJuIGFcbi8vIHByZXN1bWFibHkgZGlmZmVyZW50IGNhbGxiYWNrIGZ1bmN0aW9uLlxuLy8gVGhpcyBtYWtlcyBzdXJlIHRoYXQgb3duIHByb3BlcnRpZXMgYXJlIHJldGFpbmVkLCBzbyB0aGF0XG4vLyBkZWNvcmF0aW9ucyBhbmQgc3VjaCBhcmUgbm90IGxvc3QgYWxvbmcgdGhlIHdheS5cbm1vZHVsZS5leHBvcnRzID0gd3JhcHB5XG5mdW5jdGlvbiB3cmFwcHkgKGZuLCBjYikge1xuICBpZiAoZm4gJiYgY2IpIHJldHVybiB3cmFwcHkoZm4pKGNiKVxuXG4gIGlmICh0eXBlb2YgZm4gIT09ICdmdW5jdGlvbicpXG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcignbmVlZCB3cmFwcGVyIGZ1bmN0aW9uJylcblxuICBPYmplY3Qua2V5cyhmbikuZm9yRWFjaChmdW5jdGlvbiAoaykge1xuICAgIHdyYXBwZXJba10gPSBmbltrXVxuICB9KVxuXG4gIHJldHVybiB3cmFwcGVyXG5cbiAgZnVuY3Rpb24gd3JhcHBlcigpIHtcbiAgICB2YXIgYXJncyA9IG5ldyBBcnJheShhcmd1bWVudHMubGVuZ3RoKVxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYXJncy5sZW5ndGg7IGkrKykge1xuICAgICAgYXJnc1tpXSA9IGFyZ3VtZW50c1tpXVxuICAgIH1cbiAgICB2YXIgcmV0ID0gZm4uYXBwbHkodGhpcywgYXJncylcbiAgICB2YXIgY2IgPSBhcmdzW2FyZ3MubGVuZ3RoLTFdXG4gICAgaWYgKHR5cGVvZiByZXQgPT09ICdmdW5jdGlvbicgJiYgcmV0ICE9PSBjYikge1xuICAgICAgT2JqZWN0LmtleXMoY2IpLmZvckVhY2goZnVuY3Rpb24gKGspIHtcbiAgICAgICAgcmV0W2tdID0gY2Jba11cbiAgICAgIH0pXG4gICAgfVxuICAgIHJldHVybiByZXRcbiAgfVxufVxuIiwidmFyIG9uY2UgPSByZXF1aXJlKCdvbmNlJyk7XG5cbnZhciBub29wID0gZnVuY3Rpb24oKSB7fTtcblxudmFyIGlzUmVxdWVzdCA9IGZ1bmN0aW9uKHN0cmVhbSkge1xuXHRyZXR1cm4gc3RyZWFtLnNldEhlYWRlciAmJiB0eXBlb2Ygc3RyZWFtLmFib3J0ID09PSAnZnVuY3Rpb24nO1xufTtcblxudmFyIGlzQ2hpbGRQcm9jZXNzID0gZnVuY3Rpb24oc3RyZWFtKSB7XG5cdHJldHVybiBzdHJlYW0uc3RkaW8gJiYgQXJyYXkuaXNBcnJheShzdHJlYW0uc3RkaW8pICYmIHN0cmVhbS5zdGRpby5sZW5ndGggPT09IDNcbn07XG5cbnZhciBlb3MgPSBmdW5jdGlvbihzdHJlYW0sIG9wdHMsIGNhbGxiYWNrKSB7XG5cdGlmICh0eXBlb2Ygb3B0cyA9PT0gJ2Z1bmN0aW9uJykgcmV0dXJuIGVvcyhzdHJlYW0sIG51bGwsIG9wdHMpO1xuXHRpZiAoIW9wdHMpIG9wdHMgPSB7fTtcblxuXHRjYWxsYmFjayA9IG9uY2UoY2FsbGJhY2sgfHwgbm9vcCk7XG5cblx0dmFyIHdzID0gc3RyZWFtLl93cml0YWJsZVN0YXRlO1xuXHR2YXIgcnMgPSBzdHJlYW0uX3JlYWRhYmxlU3RhdGU7XG5cdHZhciByZWFkYWJsZSA9IG9wdHMucmVhZGFibGUgfHwgKG9wdHMucmVhZGFibGUgIT09IGZhbHNlICYmIHN0cmVhbS5yZWFkYWJsZSk7XG5cdHZhciB3cml0YWJsZSA9IG9wdHMud3JpdGFibGUgfHwgKG9wdHMud3JpdGFibGUgIT09IGZhbHNlICYmIHN0cmVhbS53cml0YWJsZSk7XG5cblx0dmFyIG9ubGVnYWN5ZmluaXNoID0gZnVuY3Rpb24oKSB7XG5cdFx0aWYgKCFzdHJlYW0ud3JpdGFibGUpIG9uZmluaXNoKCk7XG5cdH07XG5cblx0dmFyIG9uZmluaXNoID0gZnVuY3Rpb24oKSB7XG5cdFx0d3JpdGFibGUgPSBmYWxzZTtcblx0XHRpZiAoIXJlYWRhYmxlKSBjYWxsYmFjaygpO1xuXHR9O1xuXG5cdHZhciBvbmVuZCA9IGZ1bmN0aW9uKCkge1xuXHRcdHJlYWRhYmxlID0gZmFsc2U7XG5cdFx0aWYgKCF3cml0YWJsZSkgY2FsbGJhY2soKTtcblx0fTtcblxuXHR2YXIgb25leGl0ID0gZnVuY3Rpb24oZXhpdENvZGUpIHtcblx0XHRjYWxsYmFjayhleGl0Q29kZSA/IG5ldyBFcnJvcignZXhpdGVkIHdpdGggZXJyb3IgY29kZTogJyArIGV4aXRDb2RlKSA6IG51bGwpO1xuXHR9O1xuXG5cdHZhciBvbmNsb3NlID0gZnVuY3Rpb24oKSB7XG5cdFx0aWYgKHJlYWRhYmxlICYmICEocnMgJiYgcnMuZW5kZWQpKSByZXR1cm4gY2FsbGJhY2sobmV3IEVycm9yKCdwcmVtYXR1cmUgY2xvc2UnKSk7XG5cdFx0aWYgKHdyaXRhYmxlICYmICEod3MgJiYgd3MuZW5kZWQpKSByZXR1cm4gY2FsbGJhY2sobmV3IEVycm9yKCdwcmVtYXR1cmUgY2xvc2UnKSk7XG5cdH07XG5cblx0dmFyIG9ucmVxdWVzdCA9IGZ1bmN0aW9uKCkge1xuXHRcdHN0cmVhbS5yZXEub24oJ2ZpbmlzaCcsIG9uZmluaXNoKTtcblx0fTtcblxuXHRpZiAoaXNSZXF1ZXN0KHN0cmVhbSkpIHtcblx0XHRzdHJlYW0ub24oJ2NvbXBsZXRlJywgb25maW5pc2gpO1xuXHRcdHN0cmVhbS5vbignYWJvcnQnLCBvbmNsb3NlKTtcblx0XHRpZiAoc3RyZWFtLnJlcSkgb25yZXF1ZXN0KCk7XG5cdFx0ZWxzZSBzdHJlYW0ub24oJ3JlcXVlc3QnLCBvbnJlcXVlc3QpO1xuXHR9IGVsc2UgaWYgKHdyaXRhYmxlICYmICF3cykgeyAvLyBsZWdhY3kgc3RyZWFtc1xuXHRcdHN0cmVhbS5vbignZW5kJywgb25sZWdhY3lmaW5pc2gpO1xuXHRcdHN0cmVhbS5vbignY2xvc2UnLCBvbmxlZ2FjeWZpbmlzaCk7XG5cdH1cblxuXHRpZiAoaXNDaGlsZFByb2Nlc3Moc3RyZWFtKSkgc3RyZWFtLm9uKCdleGl0Jywgb25leGl0KTtcblxuXHRzdHJlYW0ub24oJ2VuZCcsIG9uZW5kKTtcblx0c3RyZWFtLm9uKCdmaW5pc2gnLCBvbmZpbmlzaCk7XG5cdGlmIChvcHRzLmVycm9yICE9PSBmYWxzZSkgc3RyZWFtLm9uKCdlcnJvcicsIGNhbGxiYWNrKTtcblx0c3RyZWFtLm9uKCdjbG9zZScsIG9uY2xvc2UpO1xuXG5cdHJldHVybiBmdW5jdGlvbigpIHtcblx0XHRzdHJlYW0ucmVtb3ZlTGlzdGVuZXIoJ2NvbXBsZXRlJywgb25maW5pc2gpO1xuXHRcdHN0cmVhbS5yZW1vdmVMaXN0ZW5lcignYWJvcnQnLCBvbmNsb3NlKTtcblx0XHRzdHJlYW0ucmVtb3ZlTGlzdGVuZXIoJ3JlcXVlc3QnLCBvbnJlcXVlc3QpO1xuXHRcdGlmIChzdHJlYW0ucmVxKSBzdHJlYW0ucmVxLnJlbW92ZUxpc3RlbmVyKCdmaW5pc2gnLCBvbmZpbmlzaCk7XG5cdFx0c3RyZWFtLnJlbW92ZUxpc3RlbmVyKCdlbmQnLCBvbmxlZ2FjeWZpbmlzaCk7XG5cdFx0c3RyZWFtLnJlbW92ZUxpc3RlbmVyKCdjbG9zZScsIG9ubGVnYWN5ZmluaXNoKTtcblx0XHRzdHJlYW0ucmVtb3ZlTGlzdGVuZXIoJ2ZpbmlzaCcsIG9uZmluaXNoKTtcblx0XHRzdHJlYW0ucmVtb3ZlTGlzdGVuZXIoJ2V4aXQnLCBvbmV4aXQpO1xuXHRcdHN0cmVhbS5yZW1vdmVMaXN0ZW5lcignZW5kJywgb25lbmQpO1xuXHRcdHN0cmVhbS5yZW1vdmVMaXN0ZW5lcignZXJyb3InLCBjYWxsYmFjayk7XG5cdFx0c3RyZWFtLnJlbW92ZUxpc3RlbmVyKCdjbG9zZScsIG9uY2xvc2UpO1xuXHR9O1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBlb3M7IiwidmFyIGhhdCA9IG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGJpdHMsIGJhc2UpIHtcbiAgICBpZiAoIWJhc2UpIGJhc2UgPSAxNjtcbiAgICBpZiAoYml0cyA9PT0gdW5kZWZpbmVkKSBiaXRzID0gMTI4O1xuICAgIGlmIChiaXRzIDw9IDApIHJldHVybiAnMCc7XG4gICAgXG4gICAgdmFyIGRpZ2l0cyA9IE1hdGgubG9nKE1hdGgucG93KDIsIGJpdHMpKSAvIE1hdGgubG9nKGJhc2UpO1xuICAgIGZvciAodmFyIGkgPSAyOyBkaWdpdHMgPT09IEluZmluaXR5OyBpICo9IDIpIHtcbiAgICAgICAgZGlnaXRzID0gTWF0aC5sb2coTWF0aC5wb3coMiwgYml0cyAvIGkpKSAvIE1hdGgubG9nKGJhc2UpICogaTtcbiAgICB9XG4gICAgXG4gICAgdmFyIHJlbSA9IGRpZ2l0cyAtIE1hdGguZmxvb3IoZGlnaXRzKTtcbiAgICBcbiAgICB2YXIgcmVzID0gJyc7XG4gICAgXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBNYXRoLmZsb29yKGRpZ2l0cyk7IGkrKykge1xuICAgICAgICB2YXIgeCA9IE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIGJhc2UpLnRvU3RyaW5nKGJhc2UpO1xuICAgICAgICByZXMgPSB4ICsgcmVzO1xuICAgIH1cbiAgICBcbiAgICBpZiAocmVtKSB7XG4gICAgICAgIHZhciBiID0gTWF0aC5wb3coYmFzZSwgcmVtKTtcbiAgICAgICAgdmFyIHggPSBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiBiKS50b1N0cmluZyhiYXNlKTtcbiAgICAgICAgcmVzID0geCArIHJlcztcbiAgICB9XG4gICAgXG4gICAgdmFyIHBhcnNlZCA9IHBhcnNlSW50KHJlcywgYmFzZSk7XG4gICAgaWYgKHBhcnNlZCAhPT0gSW5maW5pdHkgJiYgcGFyc2VkID49IE1hdGgucG93KDIsIGJpdHMpKSB7XG4gICAgICAgIHJldHVybiBoYXQoYml0cywgYmFzZSlcbiAgICB9XG4gICAgZWxzZSByZXR1cm4gcmVzO1xufTtcblxuaGF0LnJhY2sgPSBmdW5jdGlvbiAoYml0cywgYmFzZSwgZXhwYW5kQnkpIHtcbiAgICB2YXIgZm4gPSBmdW5jdGlvbiAoZGF0YSkge1xuICAgICAgICB2YXIgaXRlcnMgPSAwO1xuICAgICAgICBkbyB7XG4gICAgICAgICAgICBpZiAoaXRlcnMgKysgPiAxMCkge1xuICAgICAgICAgICAgICAgIGlmIChleHBhbmRCeSkgYml0cyArPSBleHBhbmRCeTtcbiAgICAgICAgICAgICAgICBlbHNlIHRocm93IG5ldyBFcnJvcigndG9vIG1hbnkgSUQgY29sbGlzaW9ucywgdXNlIG1vcmUgYml0cycpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHZhciBpZCA9IGhhdChiaXRzLCBiYXNlKTtcbiAgICAgICAgfSB3aGlsZSAoT2JqZWN0Lmhhc093blByb3BlcnR5LmNhbGwoaGF0cywgaWQpKTtcbiAgICAgICAgXG4gICAgICAgIGhhdHNbaWRdID0gZGF0YTtcbiAgICAgICAgcmV0dXJuIGlkO1xuICAgIH07XG4gICAgdmFyIGhhdHMgPSBmbi5oYXRzID0ge307XG4gICAgXG4gICAgZm4uZ2V0ID0gZnVuY3Rpb24gKGlkKSB7XG4gICAgICAgIHJldHVybiBmbi5oYXRzW2lkXTtcbiAgICB9O1xuICAgIFxuICAgIGZuLnNldCA9IGZ1bmN0aW9uIChpZCwgdmFsdWUpIHtcbiAgICAgICAgZm4uaGF0c1tpZF0gPSB2YWx1ZTtcbiAgICAgICAgcmV0dXJuIGZuO1xuICAgIH07XG4gICAgXG4gICAgZm4uYml0cyA9IGJpdHMgfHwgMTI4O1xuICAgIGZuLmJhc2UgPSBiYXNlIHx8IDE2O1xuICAgIHJldHVybiBmbjtcbn07XG4iLCJpZiAodHlwZW9mIE9iamVjdC5jcmVhdGUgPT09ICdmdW5jdGlvbicpIHtcbiAgLy8gaW1wbGVtZW50YXRpb24gZnJvbSBzdGFuZGFyZCBub2RlLmpzICd1dGlsJyBtb2R1bGVcbiAgbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBpbmhlcml0cyhjdG9yLCBzdXBlckN0b3IpIHtcbiAgICBjdG9yLnN1cGVyXyA9IHN1cGVyQ3RvclxuICAgIGN0b3IucHJvdG90eXBlID0gT2JqZWN0LmNyZWF0ZShzdXBlckN0b3IucHJvdG90eXBlLCB7XG4gICAgICBjb25zdHJ1Y3Rvcjoge1xuICAgICAgICB2YWx1ZTogY3RvcixcbiAgICAgICAgZW51bWVyYWJsZTogZmFsc2UsXG4gICAgICAgIHdyaXRhYmxlOiB0cnVlLFxuICAgICAgICBjb25maWd1cmFibGU6IHRydWVcbiAgICAgIH1cbiAgICB9KTtcbiAgfTtcbn0gZWxzZSB7XG4gIC8vIG9sZCBzY2hvb2wgc2hpbSBmb3Igb2xkIGJyb3dzZXJzXG4gIG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gaW5oZXJpdHMoY3Rvciwgc3VwZXJDdG9yKSB7XG4gICAgY3Rvci5zdXBlcl8gPSBzdXBlckN0b3JcbiAgICB2YXIgVGVtcEN0b3IgPSBmdW5jdGlvbiAoKSB7fVxuICAgIFRlbXBDdG9yLnByb3RvdHlwZSA9IHN1cGVyQ3Rvci5wcm90b3R5cGVcbiAgICBjdG9yLnByb3RvdHlwZSA9IG5ldyBUZW1wQ3RvcigpXG4gICAgY3Rvci5wcm90b3R5cGUuY29uc3RydWN0b3IgPSBjdG9yXG4gIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gTXVsdGlTdHJlYW1cblxudmFyIGluaGVyaXRzID0gcmVxdWlyZSgnaW5oZXJpdHMnKVxudmFyIHN0cmVhbSA9IHJlcXVpcmUoJ3N0cmVhbScpXG5cbmluaGVyaXRzKE11bHRpU3RyZWFtLCBzdHJlYW0uUmVhZGFibGUpXG5cbmZ1bmN0aW9uIE11bHRpU3RyZWFtIChzdHJlYW1zLCBvcHRzKSB7XG4gIGlmICghKHRoaXMgaW5zdGFuY2VvZiBNdWx0aVN0cmVhbSkpIHJldHVybiBuZXcgTXVsdGlTdHJlYW0oc3RyZWFtcywgb3B0cylcbiAgc3RyZWFtLlJlYWRhYmxlLmNhbGwodGhpcywgb3B0cylcblxuICB0aGlzLmRlc3Ryb3llZCA9IGZhbHNlXG5cbiAgdGhpcy5fZHJhaW5lZCA9IGZhbHNlXG4gIHRoaXMuX2ZvcndhcmRpbmcgPSBmYWxzZVxuICB0aGlzLl9jdXJyZW50ID0gbnVsbFxuICB0aGlzLl9xdWV1ZSA9IHN0cmVhbXMubWFwKHRvU3RyZWFtczIpXG5cbiAgdGhpcy5fbmV4dCgpXG59XG5cbk11bHRpU3RyZWFtLm9iaiA9IGZ1bmN0aW9uIChzdHJlYW1zKSB7XG4gIHJldHVybiBuZXcgTXVsdGlTdHJlYW0oc3RyZWFtcywgeyBvYmplY3RNb2RlOiB0cnVlLCBoaWdoV2F0ZXJNYXJrOiAxNiB9KVxufVxuXG5NdWx0aVN0cmVhbS5wcm90b3R5cGUuX3JlYWQgPSBmdW5jdGlvbiAoKSB7XG4gIHRoaXMuX2RyYWluZWQgPSB0cnVlXG4gIHRoaXMuX2ZvcndhcmQoKVxufVxuXG5NdWx0aVN0cmVhbS5wcm90b3R5cGUuX2ZvcndhcmQgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLl9mb3J3YXJkaW5nIHx8ICF0aGlzLl9kcmFpbmVkKSByZXR1cm5cbiAgdGhpcy5fZm9yd2FyZGluZyA9IHRydWVcblxuICB2YXIgY2h1bmtcbiAgd2hpbGUgKChjaHVuayA9IHRoaXMuX2N1cnJlbnQucmVhZCgpKSAhPT0gbnVsbCkge1xuICAgIHRoaXMuX2RyYWluZWQgPSB0aGlzLnB1c2goY2h1bmspXG4gIH1cblxuICB0aGlzLl9mb3J3YXJkaW5nID0gZmFsc2Vcbn1cblxuTXVsdGlTdHJlYW0ucHJvdG90eXBlLmRlc3Ryb3kgPSBmdW5jdGlvbiAoZXJyKSB7XG4gIGlmICh0aGlzLmRlc3Ryb3llZCkgcmV0dXJuXG4gIHRoaXMuZGVzdHJveWVkID0gdHJ1ZVxuICBcbiAgaWYgKHRoaXMuX2N1cnJlbnQgJiYgdGhpcy5fY3VycmVudC5kZXN0cm95KSB0aGlzLl9jdXJyZW50LmRlc3Ryb3koKVxuICB0aGlzLl9xdWV1ZS5mb3JFYWNoKGZ1bmN0aW9uIChzdHJlYW0pIHtcbiAgICBpZiAoc3RyZWFtLmRlc3Ryb3kpIHN0cmVhbS5kZXN0cm95KClcbiAgfSlcblxuICBpZiAoZXJyKSB0aGlzLmVtaXQoJ2Vycm9yJywgZXJyKVxuICB0aGlzLmVtaXQoJ2Nsb3NlJylcbn1cblxuTXVsdGlTdHJlYW0ucHJvdG90eXBlLl9uZXh0ID0gZnVuY3Rpb24gKCkge1xuICB2YXIgc2VsZiA9IHRoaXNcbiAgdmFyIHN0cmVhbSA9IHRoaXMuX3F1ZXVlLnNoaWZ0KClcblxuICBpZiAodHlwZW9mIHN0cmVhbSA9PT0gJ2Z1bmN0aW9uJykgc3RyZWFtID0gdG9TdHJlYW1zMihzdHJlYW0oKSlcblxuICBpZiAoIXN0cmVhbSkge1xuICAgIHRoaXMucHVzaChudWxsKVxuICAgIHJldHVyblxuICB9XG5cbiAgdGhpcy5fY3VycmVudCA9IHN0cmVhbVxuXG4gIHN0cmVhbS5vbigncmVhZGFibGUnLCBvblJlYWRhYmxlKVxuICBzdHJlYW0ub24oJ2VuZCcsIG9uRW5kKVxuICBzdHJlYW0ub24oJ2Vycm9yJywgb25FcnJvcilcbiAgc3RyZWFtLm9uKCdjbG9zZScsIG9uQ2xvc2UpXG5cbiAgZnVuY3Rpb24gb25SZWFkYWJsZSAoKSB7XG4gICAgc2VsZi5fZm9yd2FyZCgpXG4gIH1cblxuICBmdW5jdGlvbiBvbkNsb3NlICgpIHtcbiAgICBpZiAoIXN0cmVhbS5fcmVhZGFibGVTdGF0ZS5lbmRlZCkge1xuICAgICAgc2VsZi5kZXN0cm95KClcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBvbkVuZCAoKSB7XG4gICAgc2VsZi5fY3VycmVudCA9IG51bGxcbiAgICBzdHJlYW0ucmVtb3ZlTGlzdGVuZXIoJ3JlYWRhYmxlJywgb25SZWFkYWJsZSlcbiAgICBzdHJlYW0ucmVtb3ZlTGlzdGVuZXIoJ2VuZCcsIG9uRW5kKVxuICAgIHN0cmVhbS5yZW1vdmVMaXN0ZW5lcignZXJyb3InLCBvbkVycm9yKVxuICAgIHN0cmVhbS5yZW1vdmVMaXN0ZW5lcignY2xvc2UnLCBvbkNsb3NlKVxuICAgIHNlbGYuX25leHQoKVxuICB9XG5cbiAgZnVuY3Rpb24gb25FcnJvciAoZXJyKSB7XG4gICAgc2VsZi5kZXN0cm95KGVycilcbiAgfVxufVxuXG5mdW5jdGlvbiB0b1N0cmVhbXMyIChzKSB7XG4gIGlmICghcyB8fCB0eXBlb2YgcyA9PT0gJ2Z1bmN0aW9uJyB8fCBzLl9yZWFkYWJsZVN0YXRlKSByZXR1cm4gc1xuXG4gIHZhciB3cmFwID0gbmV3IHN0cmVhbS5SZWFkYWJsZSgpLndyYXAocylcbiAgaWYgKHMuZGVzdHJveSkge1xuICAgIHdyYXAuZGVzdHJveSA9IHMuZGVzdHJveS5iaW5kKHMpXG4gIH1cbiAgcmV0dXJuIHdyYXBcbn1cbiIsInZhciB3cmFwcHkgPSByZXF1aXJlKCd3cmFwcHknKVxubW9kdWxlLmV4cG9ydHMgPSB3cmFwcHkob25jZSlcblxub25jZS5wcm90byA9IG9uY2UoZnVuY3Rpb24gKCkge1xuICBPYmplY3QuZGVmaW5lUHJvcGVydHkoRnVuY3Rpb24ucHJvdG90eXBlLCAnb25jZScsIHtcbiAgICB2YWx1ZTogZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIG9uY2UodGhpcylcbiAgICB9LFxuICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZVxuICB9KVxufSlcblxuZnVuY3Rpb24gb25jZSAoZm4pIHtcbiAgdmFyIGYgPSBmdW5jdGlvbiAoKSB7XG4gICAgaWYgKGYuY2FsbGVkKSByZXR1cm4gZi52YWx1ZVxuICAgIGYuY2FsbGVkID0gdHJ1ZVxuICAgIHJldHVybiBmLnZhbHVlID0gZm4uYXBwbHkodGhpcywgYXJndW1lbnRzKVxuICB9XG4gIGYuY2FsbGVkID0gZmFsc2VcbiAgcmV0dXJuIGZcbn1cbiIsInZhciBtYWduZXQgPSByZXF1aXJlKCdtYWduZXQtdXJpJylcbnZhciBwYXJzZVRvcnJlbnRGaWxlID0gcmVxdWlyZSgncGFyc2UtdG9ycmVudC1maWxlJylcblxuLyoqXG4gKiBQYXJzZSBhIHRvcnJlbnQgaWRlbnRpZmllciAobWFnbmV0IHVyaSwgLnRvcnJlbnQgZmlsZSwgaW5mbyBoYXNoKVxuICogQHBhcmFtICB7c3RyaW5nfEJ1ZmZlcnxPYmplY3R9IHRvcnJlbnRJZFxuICogQHJldHVybiB7T2JqZWN0fVxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHBhcnNlVG9ycmVudCAodG9ycmVudElkKSB7XG4gIHZhciBsZW4gPSB0b3JyZW50SWQgJiYgdG9ycmVudElkLmxlbmd0aFxuICBpZiAodHlwZW9mIHRvcnJlbnRJZCA9PT0gJ3N0cmluZycgJiYgL21hZ25ldDovLnRlc3QodG9ycmVudElkKSkge1xuICAgIC8vIG1hZ25ldCB1cmkgKHN0cmluZylcbiAgICByZXR1cm4gbWFnbmV0KHRvcnJlbnRJZClcbiAgfSBlbHNlIGlmICh0eXBlb2YgdG9ycmVudElkID09PSAnc3RyaW5nJyAmJiAobGVuID09PSA0MCB8fCBsZW4gPT09IDMyKSkge1xuICAgIC8vIGluZm8gaGFzaCAoaGV4L2Jhc2UtMzIgc3RyaW5nKVxuICAgIHJldHVybiBtYWduZXQoJ21hZ25ldDo/eHQ9dXJuOmJ0aWg6JyArIHRvcnJlbnRJZClcbiAgfSBlbHNlIGlmIChCdWZmZXIuaXNCdWZmZXIodG9ycmVudElkKSAmJiBsZW4gPT09IDIwKSB7XG4gICAgLy8gaW5mbyBoYXNoIChidWZmZXIpXG4gICAgcmV0dXJuIHsgaW5mb0hhc2g6IHRvcnJlbnRJZC50b1N0cmluZygnaGV4JykgfVxuICB9IGVsc2UgaWYgKEJ1ZmZlci5pc0J1ZmZlcih0b3JyZW50SWQpKSB7XG4gICAgLy8gLnRvcnJlbnQgZmlsZSAoYnVmZmVyKVxuICAgIHJldHVybiBwYXJzZVRvcnJlbnRGaWxlKHRvcnJlbnRJZCkgLy8gbWlnaHQgdGhyb3dcbiAgfSBlbHNlIGlmICh0b3JyZW50SWQgJiYgdG9ycmVudElkLmluZm9IYXNoKSB7XG4gICAgLy8gcGFyc2VkIHRvcnJlbnQgKGZyb20gYHBhcnNlLXRvcnJlbnRgLCBgcGFyc2UtdG9ycmVudC1maWxlYCwgb3IgYG1hZ25ldC11cmlgKVxuICAgIHJldHVybiB0b3JyZW50SWRcbiAgfSBlbHNlIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgdG9ycmVudCBpZGVudGlmaWVyJylcbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cy50b01hZ25ldFVSSSA9IG1hZ25ldC5lbmNvZGVcbm1vZHVsZS5leHBvcnRzLnRvVG9ycmVudEZpbGUgPSBwYXJzZVRvcnJlbnRGaWxlLmVuY29kZVxuIiwibW9kdWxlLmV4cG9ydHMgPSBtYWduZXRVUklEZWNvZGVcbm1vZHVsZS5leHBvcnRzLmRlY29kZSA9IG1hZ25ldFVSSURlY29kZVxubW9kdWxlLmV4cG9ydHMuZW5jb2RlID0gbWFnbmV0VVJJRW5jb2RlXG5cbnZhciBiYXNlMzIgPSByZXF1aXJlKCd0aGlydHktdHdvJylcbnZhciBleHRlbmQgPSByZXF1aXJlKCd4dGVuZCcpXG52YXIgZmxhdHRlbiA9IHJlcXVpcmUoJ2ZsYXR0ZW4nKVxuXG4vKipcbiAqIFBhcnNlIGEgbWFnbmV0IFVSSSBhbmQgcmV0dXJuIGFuIG9iamVjdCBvZiBrZXlzL3ZhbHVlc1xuICpcbiAqIEBwYXJhbSAge3N0cmluZ30gdXJpXG4gKiBAcmV0dXJuIHtPYmplY3R9IHBhcnNlZCB1cmlcbiAqL1xuZnVuY3Rpb24gbWFnbmV0VVJJRGVjb2RlICh1cmkpIHtcbiAgdmFyIHJlc3VsdCA9IHt9XG4gIHZhciBkYXRhID0gdXJpLnNwbGl0KCdtYWduZXQ6PycpWzFdXG5cbiAgdmFyIHBhcmFtcyA9IChkYXRhICYmIGRhdGEubGVuZ3RoID49IDApXG4gICAgPyBkYXRhLnNwbGl0KCcmJylcbiAgICA6IFtdXG5cbiAgcGFyYW1zLmZvckVhY2goZnVuY3Rpb24gKHBhcmFtKSB7XG4gICAgdmFyIGtleXZhbCA9IHBhcmFtLnNwbGl0KCc9JylcblxuICAgIC8vIFRoaXMga2V5dmFsIGlzIGludmFsaWQsIHNraXAgaXRcbiAgICBpZiAoa2V5dmFsLmxlbmd0aCAhPT0gMikgcmV0dXJuXG5cbiAgICB2YXIga2V5ID0ga2V5dmFsWzBdXG4gICAgdmFyIHZhbCA9IGtleXZhbFsxXVxuXG4gICAgLy8gQ2xlYW4gdXAgdG9ycmVudCBuYW1lXG4gICAgaWYgKGtleSA9PT0gJ2RuJykgdmFsID0gZGVjb2RlVVJJQ29tcG9uZW50KHZhbCkucmVwbGFjZSgvXFwrL2csICcgJylcblxuICAgIC8vIEFkZHJlc3MgdHJhY2tlciAodHIpLCBleGFjdCBzb3VyY2UgKHhzKSwgYW5kIGFjY2VwdGFibGUgc291cmNlIChhcykgYXJlIGVuY29kZWRcbiAgICAvLyBVUklzLCBzbyBkZWNvZGUgdGhlbVxuICAgIGlmIChrZXkgPT09ICd0cicgfHwga2V5ID09PSAneHMnIHx8IGtleSA9PT0gJ2FzJyB8fCBrZXkgPT09ICd3cycpXG4gICAgICB2YWwgPSBkZWNvZGVVUklDb21wb25lbnQodmFsKVxuXG4gICAgLy8gUmV0dXJuIGtleXdvcmRzIGFzIGFuIGFycmF5XG4gICAgaWYgKGtleSA9PT0gJ2t0JykgdmFsID0gZGVjb2RlVVJJQ29tcG9uZW50KHZhbCkuc3BsaXQoJysnKVxuXG4gICAgLy8gSWYgdGhlcmUgYXJlIHJlcGVhdGVkIHBhcmFtZXRlcnMsIHJldHVybiBhbiBhcnJheSBvZiB2YWx1ZXNcbiAgICBpZiAocmVzdWx0W2tleV0pIHtcbiAgICAgIGlmIChBcnJheS5pc0FycmF5KHJlc3VsdFtrZXldKSkge1xuICAgICAgICByZXN1bHRba2V5XS5wdXNoKHZhbClcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBvbGQgPSByZXN1bHRba2V5XVxuICAgICAgICByZXN1bHRba2V5XSA9IFtvbGQsIHZhbF1cbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgcmVzdWx0W2tleV0gPSB2YWxcbiAgICB9XG4gIH0pXG5cbiAgLy8gQ29udmVuaWVuY2UgcHJvcGVydGllcyBmb3IgcGFyaXR5IHdpdGggYHBhcnNlLXRvcnJlbnQtZmlsZWAgbW9kdWxlXG4gIHZhciBtXG4gIGlmIChyZXN1bHQueHQpIHtcbiAgICB2YXIgeHRzID0gQXJyYXkuaXNBcnJheShyZXN1bHQueHQpID8gcmVzdWx0Lnh0IDogWyByZXN1bHQueHQgXVxuICAgIHh0cy5mb3JFYWNoKGZ1bmN0aW9uICh4dCkge1xuICAgICAgaWYgKChtID0geHQubWF0Y2goL151cm46YnRpaDooLns0MH0pLykpKSB7XG4gICAgICAgIHJlc3VsdC5pbmZvSGFzaCA9IG5ldyBCdWZmZXIobVsxXSwgJ2hleCcpLnRvU3RyaW5nKCdoZXgnKVxuICAgICAgfSBlbHNlIGlmICgobSA9IHh0Lm1hdGNoKC9edXJuOmJ0aWg6KC57MzJ9KS8pKSkge1xuICAgICAgICB2YXIgZGVjb2RlZFN0ciA9IGJhc2UzMi5kZWNvZGUobVsxXSlcbiAgICAgICAgcmVzdWx0LmluZm9IYXNoID0gbmV3IEJ1ZmZlcihkZWNvZGVkU3RyLCAnYmluYXJ5JykudG9TdHJpbmcoJ2hleCcpXG4gICAgICB9XG4gICAgfSlcbiAgfVxuXG4gIGlmIChyZXN1bHQuZG4pIHJlc3VsdC5uYW1lID0gcmVzdWx0LmRuXG4gIGlmIChyZXN1bHQua3QpIHJlc3VsdC5rZXl3b3JkcyA9IHJlc3VsdC5rdFxuXG4gIGlmICh0eXBlb2YgcmVzdWx0LnRyID09PSAnc3RyaW5nJykgcmVzdWx0LmFubm91bmNlID0gWyByZXN1bHQudHIgXVxuICBlbHNlIGlmIChBcnJheS5pc0FycmF5KHJlc3VsdC50cikpIHJlc3VsdC5hbm5vdW5jZSA9IHJlc3VsdC50clxuICBlbHNlIHJlc3VsdC5hbm5vdW5jZSA9IFtdXG5cbiAgcmVzdWx0LmFubm91bmNlTGlzdCA9IHJlc3VsdC5hbm5vdW5jZS5tYXAoZnVuY3Rpb24gKHVybCkge1xuICAgIHJldHVybiBbIHVybCBdXG4gIH0pXG5cbiAgcmVzdWx0LnVybExpc3QgPSBbXVxuICBpZiAodHlwZW9mIHJlc3VsdC5hcyA9PT0gJ3N0cmluZycgfHwgQXJyYXkuaXNBcnJheShyZXN1bHQuYXMpKVxuICAgIHJlc3VsdC51cmxMaXN0ID0gcmVzdWx0LnVybExpc3QuY29uY2F0KHJlc3VsdC5hcylcbiAgaWYgKHR5cGVvZiByZXN1bHQud3MgPT09ICdzdHJpbmcnIHx8IEFycmF5LmlzQXJyYXkocmVzdWx0LndzKSlcbiAgICByZXN1bHQudXJsTGlzdCA9IHJlc3VsdC51cmxMaXN0LmNvbmNhdChyZXN1bHQud3MpXG5cbiAgcmV0dXJuIHJlc3VsdFxufVxuXG5mdW5jdGlvbiBtYWduZXRVUklFbmNvZGUgKG9iaikge1xuICBvYmogPSBleHRlbmQob2JqKSAvLyBjbG9uZSBvYmosIHNvIHdlIGNhbiBtdXRhdGUgaXRcblxuICAvLyBzdXBwb3J0IG9mZmljaWFsIG1hZ25ldCBrZXkgbmFtZXMgYW5kIGNvbnZlbmllbmNlIG5hbWVzXG4gIC8vIChleGFtcGxlOiBgaW5mb0hhc2hgIGZvciBgeHRgLCBgbmFtZWAgZm9yIGBkbmApXG4gIGlmIChvYmouaW5mb0hhc2gpIG9iai54dCA9ICd1cm46YnRpaDonICsgb2JqLmluZm9IYXNoXG4gIGlmIChvYmoubmFtZSkgb2JqLmRuID0gb2JqLm5hbWVcbiAgaWYgKG9iai5rZXl3b3Jkcykgb2JqLmt0ID0gb2JqLmtleXdvcmRzXG4gIGlmIChvYmouYW5ub3VuY2UpIG9iai50ciA9IG9iai5hbm5vdW5jZVxuICBpZiAob2JqLmFubm91bmNlTGlzdCkgb2JqLnRyID0gZmxhdHRlbihvYmouYW5ub3VuY2VMaXN0KVxuICBpZiAob2JqLnVybExpc3QpIHtcbiAgICBvYmoud3MgPSBmbGF0dGVuKG9iai51cmxMaXN0KVxuICAgIGRlbGV0ZSBvYmouYXNcbiAgfVxuXG4gIHZhciByZXN1bHQgPSAnbWFnbmV0Oj8nXG4gIE9iamVjdC5rZXlzKG9iailcbiAgICAuZmlsdGVyKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgIHJldHVybiBrZXkubGVuZ3RoID09PSAyXG4gICAgfSlcbiAgICAuZm9yRWFjaChmdW5jdGlvbiAoa2V5LCBpKSB7XG4gICAgICB2YXIgdmFsdWVzID0gQXJyYXkuaXNBcnJheShvYmpba2V5XSkgPyBvYmpba2V5XSA6IFsgb2JqW2tleV0gXVxuICAgICAgdmFsdWVzLmZvckVhY2goZnVuY3Rpb24gKHZhbCwgaikge1xuICAgICAgICBpZiAoKGkgPiAwIHx8IGogPiAwKSAmJiAoa2V5ICE9PSAna3QnIHx8IGogPT09IDApKSByZXN1bHQgKz0gJyYnXG5cbiAgICAgICAgaWYgKGtleSA9PT0gJ2RuJykgdmFsID0gZW5jb2RlVVJJQ29tcG9uZW50KHZhbCkucmVwbGFjZSgvJTIwL2csICcrJylcbiAgICAgICAgaWYgKGtleSA9PT0gJ3RyJyB8fCBrZXkgPT09ICd4cycgfHwga2V5ID09PSAnYXMnIHx8IGtleSA9PT0gJ3dzJylcbiAgICAgICAgICB2YWwgPSBlbmNvZGVVUklDb21wb25lbnQodmFsKVxuICAgICAgICBpZiAoa2V5ID09PSAna3QnKSB2YWwgPSBlbmNvZGVVUklDb21wb25lbnQodmFsKVxuXG4gICAgICAgIGlmIChrZXkgPT09ICdrdCcgJiYgaiA+IDApIHJlc3VsdCArPSAnKycgKyB2YWxcbiAgICAgICAgZWxzZSByZXN1bHQgKz0ga2V5ICsgJz0nICsgdmFsXG4gICAgICB9KVxuICAgIH0pXG5cbiAgcmV0dXJuIHJlc3VsdFxufVxuIiwiLyogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcbkNvcHlyaWdodCAoYykgMjAxMSwgQ2hyaXMgVW1iZWxcblxuUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGEgY29weVxub2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGUgXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbFxuaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0c1xudG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLCBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbFxuY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdCBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzXG5mdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlIGZvbGxvd2luZyBjb25kaXRpb25zOlxuXG5UaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZCBpbiAgICAgIFxuYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG5cblRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1MgT1JcbklNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZLFxuRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU4gTk8gRVZFTlQgU0hBTEwgVEhFXG5BVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLCBEQU1BR0VTIE9SIE9USEVSXG5MSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLFxuT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBcblRIRSBTT0ZUV0FSRS5cbiovXG5cbnZhciBiYXNlMzIgPSByZXF1aXJlKCcuL3RoaXJ0eS10d28nKTtcblxuZXhwb3J0cy5lbmNvZGUgPSBiYXNlMzIuZW5jb2RlO1xuZXhwb3J0cy5kZWNvZGUgPSBiYXNlMzIuZGVjb2RlO1xuIiwiLyogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcbkNvcHlyaWdodCAoYykgMjAxMSwgQ2hyaXMgVW1iZWxcblxuUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGEgY29weVxub2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGUgXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbFxuaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0c1xudG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLCBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbFxuY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdCBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzXG5mdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlIGZvbGxvd2luZyBjb25kaXRpb25zOlxuXG5UaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZCBpblxuYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG5cblRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1MgT1JcbklNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZLFxuRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU4gTk8gRVZFTlQgU0hBTEwgVEhFXG5BVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLCBEQU1BR0VTIE9SIE9USEVSXG5MSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLFxuT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTlxuVEhFIFNPRlRXQVJFLiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcbiovXG5cbnZhciBjaGFyVGFibGUgPSBcIkFCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaMjM0NTY3XCI7XG52YXIgYnl0ZVRhYmxlID0gW1xuICAgIDB4ZmYsIDB4ZmYsIDB4MWEsIDB4MWIsIDB4MWMsIDB4MWQsIDB4MWUsIDB4MWYsXG4gICAgMHhmZiwgMHhmZiwgMHhmZiwgMHhmZiwgMHhmZiwgMHhmZiwgMHhmZiwgMHhmZixcbiAgICAweGZmLCAweDAwLCAweDAxLCAweDAyLCAweDAzLCAweDA0LCAweDA1LCAweDA2LFxuICAgIDB4MDcsIDB4MDgsIDB4MDksIDB4MGEsIDB4MGIsIDB4MGMsIDB4MGQsIDB4MGUsXG4gICAgMHgwZiwgMHgxMCwgMHgxMSwgMHgxMiwgMHgxMywgMHgxNCwgMHgxNSwgMHgxNixcbiAgICAweDE3LCAweDE4LCAweDE5LCAweGZmLCAweGZmLCAweGZmLCAweGZmLCAweGZmLFxuICAgIDB4ZmYsIDB4MDAsIDB4MDEsIDB4MDIsIDB4MDMsIDB4MDQsIDB4MDUsIDB4MDYsXG4gICAgMHgwNywgMHgwOCwgMHgwOSwgMHgwYSwgMHgwYiwgMHgwYywgMHgwZCwgMHgwZSxcbiAgICAweDBmLCAweDEwLCAweDExLCAweDEyLCAweDEzLCAweDE0LCAweDE1LCAweDE2LFxuICAgIDB4MTcsIDB4MTgsIDB4MTksIDB4ZmYsIDB4ZmYsIDB4ZmYsIDB4ZmYsIDB4ZmZcbl07XG5cbmZ1bmN0aW9uIHF1aW50ZXRDb3VudChidWZmKSB7XG4gICAgdmFyIHF1aW50ZXRzID0gTWF0aC5mbG9vcihidWZmLmxlbmd0aCAvIDUpO1xuICAgIHJldHVybiBidWZmLmxlbmd0aCAlIDUgPT0gMCA/IHF1aW50ZXRzOiBxdWludGV0cyArIDE7XG59XG5cbmV4cG9ydHMuZW5jb2RlID0gZnVuY3Rpb24ocGxhaW4pIHtcbiAgICB2YXIgaSA9IDA7XG4gICAgdmFyIGogPSAwO1xuICAgIHZhciBzaGlmdEluZGV4ID0gMDtcbiAgICB2YXIgZGlnaXQgPSAwO1xuICAgIHZhciBlbmNvZGVkID0gbmV3IEJ1ZmZlcihxdWludGV0Q291bnQocGxhaW4pICogOCk7XG4gICAgaWYoIUJ1ZmZlci5pc0J1ZmZlcihwbGFpbikpe1xuICAgIFx0cGxhaW4gPSBuZXcgQnVmZmVyKHBsYWluKTtcbiAgICB9XG5cbiAgICAvKiBieXRlIGJ5IGJ5dGUgaXNuJ3QgYXMgcHJldHR5IGFzIHF1aW50ZXQgYnkgcXVpbnRldCBidXQgdGVzdHMgYSBiaXRcbiAgICAgICAgZmFzdGVyLiB3aWxsIGhhdmUgdG8gcmV2aXNpdC4gKi9cbiAgICB3aGlsZShpIDwgcGxhaW4ubGVuZ3RoKSB7XG4gICAgICAgIHZhciBjdXJyZW50ID0gcGxhaW5baV07XG4gICAgXG4gICAgICAgIGlmKHNoaWZ0SW5kZXggPiAzKSB7XG4gICAgICAgICAgICBkaWdpdCA9IGN1cnJlbnQgJiAoMHhmZiA+PiBzaGlmdEluZGV4KTtcbiAgICAgICAgICAgIHNoaWZ0SW5kZXggPSAoc2hpZnRJbmRleCArIDUpICUgODtcbiAgICAgICAgICAgIGRpZ2l0ID0gKGRpZ2l0IDw8IHNoaWZ0SW5kZXgpIHwgKChpICsgMSA8IHBsYWluLmxlbmd0aCkgP1xuICAgICAgICAgICAgICAgIHBsYWluW2kgKyAxXSA6IDApID4+ICg4IC0gc2hpZnRJbmRleCk7XG4gICAgICAgICAgICBpKys7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBkaWdpdCA9IChjdXJyZW50ID4+ICg4IC0gKHNoaWZ0SW5kZXggKyA1KSkpICYgMHgxZjtcbiAgICAgICAgICAgIHNoaWZ0SW5kZXggPSAoc2hpZnRJbmRleCArIDUpICUgODsgICAgICAgICAgICBcbiAgICAgICAgICAgIGlmKHNoaWZ0SW5kZXggPT0gMCkgaSsrO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBlbmNvZGVkW2pdID0gY2hhclRhYmxlLmNoYXJDb2RlQXQoZGlnaXQpO1xuICAgICAgICBqKys7XG4gICAgfVxuXG4gICAgZm9yKGkgPSBqOyBpIDwgZW5jb2RlZC5sZW5ndGg7IGkrKylcbiAgICAgICAgZW5jb2RlZFtpXSA9IDB4M2Q7IC8vJz0nLmNoYXJDb2RlQXQoMClcbiAgICAgICAgXG4gICAgcmV0dXJuIGVuY29kZWQ7XG59O1xuXG5leHBvcnRzLmRlY29kZSA9IGZ1bmN0aW9uKGVuY29kZWQpIHtcbiAgICB2YXIgc2hpZnRJbmRleCA9IDA7XG4gICAgdmFyIHBsYWluRGlnaXQgPSAwO1xuICAgIHZhciBwbGFpbkNoYXI7XG4gICAgdmFyIHBsYWluUG9zID0gMDtcbiAgICBpZighQnVmZmVyLmlzQnVmZmVyKGVuY29kZWQpKXtcbiAgICBcdGVuY29kZWQgPSBuZXcgQnVmZmVyKGVuY29kZWQpO1xuICAgIH1cbiAgICB2YXIgZGVjb2RlZCA9IG5ldyBCdWZmZXIoTWF0aC5jZWlsKGVuY29kZWQubGVuZ3RoICogNSAvIDgpKTtcbiAgICBcbiAgICAvKiBieXRlIGJ5IGJ5dGUgaXNuJ3QgYXMgcHJldHR5IGFzIG9jdGV0IGJ5IG9jdGV0IGJ1dCB0ZXN0cyBhIGJpdFxuICAgICAgICBmYXN0ZXIuIHdpbGwgaGF2ZSB0byByZXZpc2l0LiAqLyAgICBcbiAgICBmb3IodmFyIGkgPSAwOyBpIDwgZW5jb2RlZC5sZW5ndGg7IGkrKykge1xuICAgIFx0aWYoZW5jb2RlZFtpXSA9PSAweDNkKXsgLy8nPSdcbiAgICBcdFx0YnJlYWs7XG4gICAgXHR9XG4gICAgXHRcdFxuICAgICAgICB2YXIgZW5jb2RlZEJ5dGUgPSBlbmNvZGVkW2ldIC0gMHgzMDtcbiAgICAgICAgXG4gICAgICAgIGlmKGVuY29kZWRCeXRlIDwgYnl0ZVRhYmxlLmxlbmd0aCkge1xuICAgICAgICAgICAgcGxhaW5EaWdpdCA9IGJ5dGVUYWJsZVtlbmNvZGVkQnl0ZV07XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGlmKHNoaWZ0SW5kZXggPD0gMykge1xuICAgICAgICAgICAgICAgIHNoaWZ0SW5kZXggPSAoc2hpZnRJbmRleCArIDUpICUgODtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpZihzaGlmdEluZGV4ID09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgcGxhaW5DaGFyIHw9IHBsYWluRGlnaXQ7XG4gICAgICAgICAgICAgICAgICAgIGRlY29kZWRbcGxhaW5Qb3NdID0gcGxhaW5DaGFyO1xuICAgICAgICAgICAgICAgICAgICBwbGFpblBvcysrO1xuICAgICAgICAgICAgICAgICAgICBwbGFpbkNoYXIgPSAwO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHBsYWluQ2hhciB8PSAweGZmICYgKHBsYWluRGlnaXQgPDwgKDggLSBzaGlmdEluZGV4KSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBzaGlmdEluZGV4ID0gKHNoaWZ0SW5kZXggKyA1KSAlIDg7XG4gICAgICAgICAgICAgICAgcGxhaW5DaGFyIHw9IDB4ZmYgJiAocGxhaW5EaWdpdCA+Pj4gc2hpZnRJbmRleCk7XG4gICAgICAgICAgICAgICAgZGVjb2RlZFtwbGFpblBvc10gPSBwbGFpbkNoYXI7XG4gICAgICAgICAgICAgICAgcGxhaW5Qb3MrKztcblxuICAgICAgICAgICAgICAgIHBsYWluQ2hhciA9IDB4ZmYgJiAocGxhaW5EaWdpdCA8PCAoOCAtIHNoaWZ0SW5kZXgpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgXHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgaW5wdXQgLSBpdCBpcyBub3QgYmFzZTMyIGVuY29kZWQgc3RyaW5nJyk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGRlY29kZWQuc2xpY2UoMCwgcGxhaW5Qb3MpO1xufTtcbiIsIm1vZHVsZS5leHBvcnRzID0gZGVjb2RlVG9ycmVudEZpbGVcbm1vZHVsZS5leHBvcnRzLmRlY29kZSA9IGRlY29kZVRvcnJlbnRGaWxlXG5tb2R1bGUuZXhwb3J0cy5lbmNvZGUgPSBlbmNvZGVUb3JyZW50RmlsZVxuXG52YXIgYmVuY29kZSA9IHJlcXVpcmUoJ2JlbmNvZGUnKVxudmFyIHBhdGggPSByZXF1aXJlKCdwYXRoJylcbnZhciBzaGExID0gcmVxdWlyZSgnc2ltcGxlLXNoYTEnKVxuXG4vKipcbiAqIFBhcnNlIGEgdG9ycmVudC4gVGhyb3dzIGFuIGV4Y2VwdGlvbiBpZiB0aGUgdG9ycmVudCBpcyBtaXNzaW5nIHJlcXVpcmVkIGZpZWxkcy5cbiAqIEBwYXJhbSAge0J1ZmZlcnxPYmplY3R9IHRvcnJlbnRcbiAqIEByZXR1cm4ge09iamVjdH0gICAgICAgIHBhcnNlZCB0b3JyZW50XG4gKi9cbmZ1bmN0aW9uIGRlY29kZVRvcnJlbnRGaWxlICh0b3JyZW50KSB7XG4gIGlmIChCdWZmZXIuaXNCdWZmZXIodG9ycmVudCkpIHtcbiAgICB0b3JyZW50ID0gYmVuY29kZS5kZWNvZGUodG9ycmVudClcbiAgfVxuXG4gIC8vIHNhbml0eSBjaGVja1xuICBlbnN1cmUodG9ycmVudC5pbmZvLCAnaW5mbycpXG4gIGVuc3VyZSh0b3JyZW50LmluZm8ubmFtZSwgJ2luZm8ubmFtZScpXG4gIGVuc3VyZSh0b3JyZW50LmluZm9bJ3BpZWNlIGxlbmd0aCddLCAnaW5mb1tcXCdwaWVjZSBsZW5ndGhcXCddJylcbiAgZW5zdXJlKHRvcnJlbnQuaW5mby5waWVjZXMsICdpbmZvLnBpZWNlcycpXG5cbiAgaWYgKHRvcnJlbnQuaW5mby5maWxlcykge1xuICAgIHRvcnJlbnQuaW5mby5maWxlcy5mb3JFYWNoKGZ1bmN0aW9uIChmaWxlKSB7XG4gICAgICBlbnN1cmUodHlwZW9mIGZpbGUubGVuZ3RoID09PSAnbnVtYmVyJywgJ2luZm8uZmlsZXNbMF0ubGVuZ3RoJylcbiAgICAgIGVuc3VyZShmaWxlLnBhdGgsICdpbmZvLmZpbGVzWzBdLnBhdGgnKVxuICAgIH0pXG4gIH0gZWxzZSB7XG4gICAgZW5zdXJlKHRvcnJlbnQuaW5mby5sZW5ndGgsICdpbmZvLmxlbmd0aCcpXG4gIH1cblxuICB2YXIgcmVzdWx0ID0ge31cbiAgcmVzdWx0LmluZm8gPSB0b3JyZW50LmluZm9cbiAgcmVzdWx0LmluZm9CdWZmZXIgPSBiZW5jb2RlLmVuY29kZSh0b3JyZW50LmluZm8pXG4gIHJlc3VsdC5pbmZvSGFzaCA9IHNoYTEuc3luYyhyZXN1bHQuaW5mb0J1ZmZlcilcblxuICByZXN1bHQubmFtZSA9IHRvcnJlbnQuaW5mby5uYW1lLnRvU3RyaW5nKClcbiAgcmVzdWx0LnByaXZhdGUgPSAhIXRvcnJlbnQuaW5mby5wcml2YXRlXG5cbiAgaWYgKHRvcnJlbnRbJ2NyZWF0aW9uIGRhdGUnXSlcbiAgICByZXN1bHQuY3JlYXRlZCA9IG5ldyBEYXRlKHRvcnJlbnRbJ2NyZWF0aW9uIGRhdGUnXSAqIDEwMDApXG5cbiAgaWYgKEJ1ZmZlci5pc0J1ZmZlcih0b3JyZW50LmNvbW1lbnQpKVxuICAgIHJlc3VsdC5jb21tZW50ID0gdG9ycmVudC5jb21tZW50LnRvU3RyaW5nKClcblxuICAvLyBhbm5vdW5jZS9hbm5vdW5jZS1saXN0IG1heSBiZSBtaXNzaW5nIGlmIG1ldGFkYXRhIGZldGNoZWQgdmlhIHV0X21ldGFkYXRhIGV4dGVuc2lvblxuICB2YXIgYW5ub3VuY2UgPSB0b3JyZW50Wydhbm5vdW5jZS1saXN0J11cbiAgaWYgKCFhbm5vdW5jZSkge1xuICAgIGlmICh0b3JyZW50LmFubm91bmNlKSB7XG4gICAgICBhbm5vdW5jZSA9IFtbdG9ycmVudC5hbm5vdW5jZV1dXG4gICAgfSBlbHNlIHtcbiAgICAgIGFubm91bmNlID0gW11cbiAgICB9XG4gIH1cblxuICByZXN1bHQuYW5ub3VuY2VMaXN0ID0gYW5ub3VuY2UubWFwKGZ1bmN0aW9uICh1cmxzKSB7XG4gICAgcmV0dXJuIHVybHMubWFwKGZ1bmN0aW9uICh1cmwpIHtcbiAgICAgIHJldHVybiB1cmwudG9TdHJpbmcoKVxuICAgIH0pXG4gIH0pXG5cbiAgcmVzdWx0LmFubm91bmNlID0gW10uY29uY2F0LmFwcGx5KFtdLCByZXN1bHQuYW5ub3VuY2VMaXN0KVxuXG4gIC8vIGhhbmRsZSB1cmwtbGlzdCAoQkVQMTkgLyB3ZWIgc2VlZGluZylcbiAgaWYgKEJ1ZmZlci5pc0J1ZmZlcih0b3JyZW50Wyd1cmwtbGlzdCddKSkge1xuICAgIC8vIHNvbWUgY2xpZW50cyBzZXQgdXJsLWxpc3QgdG8gZW1wdHkgc3RyaW5nXG4gICAgdG9ycmVudFsndXJsLWxpc3QnXSA9IHRvcnJlbnRbJ3VybC1saXN0J10ubGVuZ3RoID4gMFxuICAgICAgPyBbIHRvcnJlbnRbJ3VybC1saXN0J10gXVxuICAgICAgOiBbXVxuICB9XG4gIHJlc3VsdC51cmxMaXN0ID0gKHRvcnJlbnRbJ3VybC1saXN0J10gfHwgW10pLm1hcChmdW5jdGlvbiAodXJsKSB7XG4gICAgcmV0dXJuIHVybC50b1N0cmluZygpXG4gIH0pXG5cbiAgdmFyIGZpbGVzID0gdG9ycmVudC5pbmZvLmZpbGVzIHx8IFt0b3JyZW50LmluZm9dXG4gIHJlc3VsdC5maWxlcyA9IGZpbGVzLm1hcChmdW5jdGlvbiAoZmlsZSwgaSkge1xuICAgIHZhciBwYXJ0cyA9IFtdLmNvbmNhdChmaWxlLm5hbWUgfHwgcmVzdWx0Lm5hbWUsIGZpbGUucGF0aCB8fCBbXSkubWFwKGZ1bmN0aW9uIChwKSB7XG4gICAgICByZXR1cm4gcC50b1N0cmluZygpXG4gICAgfSlcbiAgICByZXR1cm4ge1xuICAgICAgcGF0aDogcGF0aC5qb2luLmFwcGx5KG51bGwsIFtwYXRoLnNlcF0uY29uY2F0KHBhcnRzKSkuc2xpY2UoMSksXG4gICAgICBuYW1lOiBwYXJ0c1twYXJ0cy5sZW5ndGggLSAxXSxcbiAgICAgIGxlbmd0aDogZmlsZS5sZW5ndGgsXG4gICAgICBvZmZzZXQ6IGZpbGVzLnNsaWNlKDAsIGkpLnJlZHVjZShzdW1MZW5ndGgsIDApXG4gICAgfVxuICB9KVxuXG4gIHJlc3VsdC5sZW5ndGggPSBmaWxlcy5yZWR1Y2Uoc3VtTGVuZ3RoLCAwKVxuXG4gIHZhciBsYXN0RmlsZSA9IHJlc3VsdC5maWxlc1tyZXN1bHQuZmlsZXMubGVuZ3RoIC0gMV1cblxuICByZXN1bHQucGllY2VMZW5ndGggPSB0b3JyZW50LmluZm9bJ3BpZWNlIGxlbmd0aCddXG4gIHJlc3VsdC5sYXN0UGllY2VMZW5ndGggPSAoKGxhc3RGaWxlLm9mZnNldCArIGxhc3RGaWxlLmxlbmd0aCkgJSByZXN1bHQucGllY2VMZW5ndGgpIHx8IHJlc3VsdC5waWVjZUxlbmd0aFxuICByZXN1bHQucGllY2VzID0gc3BsaXRQaWVjZXModG9ycmVudC5pbmZvLnBpZWNlcylcblxuICByZXR1cm4gcmVzdWx0XG59XG5cbi8qKlxuICogQ29udmVydCBhIHBhcnNlZCB0b3JyZW50IG9iamVjdCBiYWNrIGludG8gYSAudG9ycmVudCBmaWxlIGJ1ZmZlci5cbiAqIEBwYXJhbSAge09iamVjdH0gcGFyc2VkIHBhcnNlZCB0b3JyZW50XG4gKiBAcmV0dXJuIHtCdWZmZXJ9XG4gKi9cbmZ1bmN0aW9uIGVuY29kZVRvcnJlbnRGaWxlIChwYXJzZWQpIHtcbiAgdmFyIHRvcnJlbnQgPSB7XG4gICAgaW5mbzogcGFyc2VkLmluZm9cbiAgfVxuXG4gIGlmIChwYXJzZWQuYW5ub3VuY2UgJiYgcGFyc2VkLmFubm91bmNlWzBdKSB7XG4gICAgdG9ycmVudC5hbm5vdW5jZSA9IHBhcnNlZC5hbm5vdW5jZVswXVxuICB9XG5cbiAgaWYgKHBhcnNlZC5hbm5vdW5jZUxpc3QpIHtcbiAgICB0b3JyZW50Wydhbm5vdW5jZS1saXN0J10gPSBwYXJzZWQuYW5ub3VuY2VMaXN0Lm1hcChmdW5jdGlvbiAodXJscykge1xuICAgICAgcmV0dXJuIHVybHMubWFwKGZ1bmN0aW9uICh1cmwpIHtcbiAgICAgICAgdXJsID0gbmV3IEJ1ZmZlcih1cmwsICd1dGY4JylcbiAgICAgICAgaWYgKCF0b3JyZW50LmFubm91bmNlKSB7XG4gICAgICAgICAgdG9ycmVudC5hbm5vdW5jZSA9IHVybFxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB1cmxcbiAgICAgIH0pXG4gICAgfSlcbiAgfVxuXG4gIGlmIChwYXJzZWQuY3JlYXRlZCkge1xuICAgIHRvcnJlbnRbJ2NyZWF0aW9uIGRhdGUnXSA9IChwYXJzZWQuY3JlYXRlZC5nZXRUaW1lKCkgLyAxMDAwKSB8IDBcbiAgfVxuICByZXR1cm4gYmVuY29kZS5lbmNvZGUodG9ycmVudClcbn1cblxuZnVuY3Rpb24gc3VtTGVuZ3RoIChzdW0sIGZpbGUpIHtcbiAgcmV0dXJuIHN1bSArIGZpbGUubGVuZ3RoXG59XG5cbmZ1bmN0aW9uIHNwbGl0UGllY2VzIChidWYpIHtcbiAgdmFyIHBpZWNlcyA9IFtdXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgYnVmLmxlbmd0aDsgaSArPSAyMCkge1xuICAgIHBpZWNlcy5wdXNoKGJ1Zi5zbGljZShpLCBpICsgMjApLnRvU3RyaW5nKCdoZXgnKSlcbiAgfVxuICByZXR1cm4gcGllY2VzXG59XG5cbmZ1bmN0aW9uIGVuc3VyZSAoYm9vbCwgZmllbGROYW1lKSB7XG4gIGlmICghYm9vbCkgdGhyb3cgbmV3IEVycm9yKCdUb3JyZW50IGlzIG1pc3NpbmcgcmVxdWlyZWQgZmllbGQ6ICcgKyBmaWVsZE5hbWUpXG59XG4iLCJ2YXIgRGljdCA9IHJlcXVpcmUoXCIuL2RpY3RcIilcblxuLyoqXG4gKiBEZWNvZGVzIGJlbmNvZGVkIGRhdGEuXG4gKlxuICogQHBhcmFtICB7QnVmZmVyfSBkYXRhXG4gKiBAcGFyYW0gIHtTdHJpbmd9IGVuY29kaW5nXG4gKiBAcmV0dXJuIHtPYmplY3R8QXJyYXl8QnVmZmVyfFN0cmluZ3xOdW1iZXJ9XG4gKi9cbmZ1bmN0aW9uIGRlY29kZSggZGF0YSwgZW5jb2RpbmcgKSB7XG5cbiAgZGVjb2RlLnBvc2l0aW9uID0gMFxuICBkZWNvZGUuZW5jb2RpbmcgPSBlbmNvZGluZyB8fCBudWxsXG5cbiAgZGVjb2RlLmRhdGEgPSAhKCBCdWZmZXIuaXNCdWZmZXIoZGF0YSkgKVxuICAgID8gbmV3IEJ1ZmZlciggZGF0YSApXG4gICAgOiBkYXRhXG5cbiAgcmV0dXJuIGRlY29kZS5uZXh0KClcblxufVxuXG5kZWNvZGUucG9zaXRpb24gPSAwXG5kZWNvZGUuZGF0YSAgICAgPSBudWxsXG5kZWNvZGUuZW5jb2RpbmcgPSBudWxsXG5cbmRlY29kZS5uZXh0ID0gZnVuY3Rpb24oKSB7XG5cbiAgc3dpdGNoKCBkZWNvZGUuZGF0YVtkZWNvZGUucG9zaXRpb25dICkge1xuICAgIGNhc2UgMHg2NDogcmV0dXJuIGRlY29kZS5kaWN0aW9uYXJ5KCk7IGJyZWFrXG4gICAgY2FzZSAweDZDOiByZXR1cm4gZGVjb2RlLmxpc3QoKTsgYnJlYWtcbiAgICBjYXNlIDB4Njk6IHJldHVybiBkZWNvZGUuaW50ZWdlcigpOyBicmVha1xuICAgIGRlZmF1bHQ6ICAgcmV0dXJuIGRlY29kZS5ieXRlcygpOyBicmVha1xuICB9XG5cbn1cblxuZGVjb2RlLmZpbmQgPSBmdW5jdGlvbiggY2hyICkge1xuXG4gIHZhciBpID0gZGVjb2RlLnBvc2l0aW9uXG4gIHZhciBjID0gZGVjb2RlLmRhdGEubGVuZ3RoXG4gIHZhciBkID0gZGVjb2RlLmRhdGFcblxuICB3aGlsZSggaSA8IGMgKSB7XG4gICAgaWYoIGRbaV0gPT09IGNociApXG4gICAgICByZXR1cm4gaVxuICAgIGkrK1xuICB9XG5cbiAgdGhyb3cgbmV3IEVycm9yKFxuICAgICdJbnZhbGlkIGRhdGE6IE1pc3NpbmcgZGVsaW1pdGVyIFwiJyArXG4gICAgU3RyaW5nLmZyb21DaGFyQ29kZSggY2hyICkgKyAnXCIgWzB4JyArXG4gICAgY2hyLnRvU3RyaW5nKCAxNiApICsgJ10nXG4gIClcblxufVxuXG5kZWNvZGUuZGljdGlvbmFyeSA9IGZ1bmN0aW9uKCkge1xuXG4gIGRlY29kZS5wb3NpdGlvbisrXG5cbiAgdmFyIGRpY3QgPSBuZXcgRGljdCgpXG5cbiAgd2hpbGUoIGRlY29kZS5kYXRhW2RlY29kZS5wb3NpdGlvbl0gIT09IDB4NjUgKSB7XG4gICAgZGljdC5iaW5hcnlTZXQoZGVjb2RlLmJ5dGVzKCksIGRlY29kZS5uZXh0KCkpXG4gIH1cblxuICBkZWNvZGUucG9zaXRpb24rK1xuXG4gIHJldHVybiBkaWN0XG5cbn1cblxuZGVjb2RlLmxpc3QgPSBmdW5jdGlvbigpIHtcblxuICBkZWNvZGUucG9zaXRpb24rK1xuXG4gIHZhciBsc3QgPSBbXVxuXG4gIHdoaWxlKCBkZWNvZGUuZGF0YVtkZWNvZGUucG9zaXRpb25dICE9PSAweDY1ICkge1xuICAgIGxzdC5wdXNoKCBkZWNvZGUubmV4dCgpIClcbiAgfVxuXG4gIGRlY29kZS5wb3NpdGlvbisrXG5cbiAgcmV0dXJuIGxzdFxuXG59XG5cbmRlY29kZS5pbnRlZ2VyID0gZnVuY3Rpb24oKSB7XG5cbiAgdmFyIGVuZCAgICA9IGRlY29kZS5maW5kKCAweDY1IClcbiAgdmFyIG51bWJlciA9IGRlY29kZS5kYXRhLnRvU3RyaW5nKCAnYXNjaWknLCBkZWNvZGUucG9zaXRpb24gKyAxLCBlbmQgKVxuXG4gIGRlY29kZS5wb3NpdGlvbiArPSBlbmQgKyAxIC0gZGVjb2RlLnBvc2l0aW9uXG5cbiAgcmV0dXJuIHBhcnNlSW50KCBudW1iZXIsIDEwIClcblxufVxuXG5kZWNvZGUuYnl0ZXMgPSBmdW5jdGlvbigpIHtcblxuICB2YXIgc2VwICAgID0gZGVjb2RlLmZpbmQoIDB4M0EgKVxuICB2YXIgbGVuZ3RoID0gcGFyc2VJbnQoIGRlY29kZS5kYXRhLnRvU3RyaW5nKCAnYXNjaWknLCBkZWNvZGUucG9zaXRpb24sIHNlcCApLCAxMCApXG4gIHZhciBlbmQgICAgPSArK3NlcCArIGxlbmd0aFxuXG4gIGRlY29kZS5wb3NpdGlvbiA9IGVuZFxuXG4gIHJldHVybiBkZWNvZGUuZW5jb2RpbmdcbiAgICA/IGRlY29kZS5kYXRhLnRvU3RyaW5nKCBkZWNvZGUuZW5jb2RpbmcsIHNlcCwgZW5kIClcbiAgICA6IGRlY29kZS5kYXRhLnNsaWNlKCBzZXAsIGVuZCApXG5cbn1cblxuLy8gRXhwb3J0c1xubW9kdWxlLmV4cG9ydHMgPSBkZWNvZGVcbiIsIi8qKlxuICogRW5jb2RlcyBkYXRhIGluIGJlbmNvZGUuXG4gKlxuICogQHBhcmFtICB7QnVmZmVyfEFycmF5fFN0cmluZ3xPYmplY3R8TnVtYmVyfSBkYXRhXG4gKiBAcmV0dXJuIHtCdWZmZXJ9XG4gKi9cbmZ1bmN0aW9uIGVuY29kZSggZGF0YSApIHtcbiAgdmFyIGJ1ZmZlcnMgPSBbXVxuICBlbmNvZGUuX2VuY29kZSggYnVmZmVycywgZGF0YSApXG4gIHJldHVybiBCdWZmZXIuY29uY2F0KCBidWZmZXJzIClcbn1cblxuZW5jb2RlLl9mbG9hdENvbnZlcnNpb25EZXRlY3RlZCA9IGZhbHNlXG5cbmVuY29kZS5fZW5jb2RlID0gZnVuY3Rpb24oIGJ1ZmZlcnMsIGRhdGEgKSB7XG5cbiAgaWYoIEJ1ZmZlci5pc0J1ZmZlcihkYXRhKSApIHtcbiAgICBidWZmZXJzLnB1c2gobmV3IEJ1ZmZlcihkYXRhLmxlbmd0aCArICc6JykpXG4gICAgYnVmZmVycy5wdXNoKGRhdGEpXG4gICAgcmV0dXJuO1xuICB9XG5cbiAgc3dpdGNoKCB0eXBlb2YgZGF0YSApIHtcbiAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgZW5jb2RlLmJ5dGVzKCBidWZmZXJzLCBkYXRhIClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgIGVuY29kZS5udW1iZXIoIGJ1ZmZlcnMsIGRhdGEgKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICdvYmplY3QnOlxuICAgICAgZGF0YS5jb25zdHJ1Y3RvciA9PT0gQXJyYXlcbiAgICAgICAgPyBlbmNvZGUubGlzdCggYnVmZmVycywgZGF0YSApXG4gICAgICAgIDogZW5jb2RlLmRpY3QoIGJ1ZmZlcnMsIGRhdGEgKVxuICAgICAgYnJlYWtcbiAgfVxuXG59XG5cbnZhciBidWZmX2UgPSBuZXcgQnVmZmVyKCdlJylcbiAgLCBidWZmX2QgPSBuZXcgQnVmZmVyKCdkJylcbiAgLCBidWZmX2wgPSBuZXcgQnVmZmVyKCdsJylcblxuZW5jb2RlLmJ5dGVzID0gZnVuY3Rpb24oIGJ1ZmZlcnMsIGRhdGEgKSB7XG5cbiAgYnVmZmVycy5wdXNoKCBuZXcgQnVmZmVyKEJ1ZmZlci5ieXRlTGVuZ3RoKCBkYXRhICkgKyAnOicgKyBkYXRhKSApXG59XG5cbmVuY29kZS5udW1iZXIgPSBmdW5jdGlvbiggYnVmZmVycywgZGF0YSApIHtcbiAgdmFyIG1heExvID0gMHg4MDAwMDAwMFxuICB2YXIgaGkgPSAoIGRhdGEgLyBtYXhMbyApIDw8IDBcbiAgdmFyIGxvID0gKCBkYXRhICUgbWF4TG8gICkgPDwgMFxuICB2YXIgdmFsID0gaGkgKiBtYXhMbyArIGxvXG5cbiAgYnVmZmVycy5wdXNoKCBuZXcgQnVmZmVyKCAnaScgKyB2YWwgKyAnZScgKSlcblxuICBpZiggdmFsICE9PSBkYXRhICYmICFlbmNvZGUuX2Zsb2F0Q29udmVyc2lvbkRldGVjdGVkICkge1xuICAgIGVuY29kZS5fZmxvYXRDb252ZXJzaW9uRGV0ZWN0ZWQgPSB0cnVlXG4gICAgY29uc29sZS53YXJuKFxuICAgICAgJ1dBUk5JTkc6IFBvc3NpYmxlIGRhdGEgY29ycnVwdGlvbiBkZXRlY3RlZCB3aXRoIHZhbHVlIFwiJytkYXRhKydcIjonLFxuICAgICAgJ0JlbmNvZGluZyBvbmx5IGRlZmluZXMgc3VwcG9ydCBmb3IgaW50ZWdlcnMsIHZhbHVlIHdhcyBjb252ZXJ0ZWQgdG8gXCInK3ZhbCsnXCInXG4gICAgKVxuICAgIGNvbnNvbGUudHJhY2UoKVxuICB9XG5cbn1cblxuZW5jb2RlLmRpY3QgPSBmdW5jdGlvbiggYnVmZmVycywgZGF0YSApIHtcblxuICBidWZmZXJzLnB1c2goIGJ1ZmZfZCApXG5cbiAgdmFyIGogPSAwXG4gIHZhciBrXG4gIC8vIGZpeCBmb3IgaXNzdWUgIzEzIC0gc29ydGVkIGRpY3RzXG4gIHZhciBrZXlzID0gT2JqZWN0LmtleXMoIGRhdGEgKS5zb3J0KClcbiAgdmFyIGtsID0ga2V5cy5sZW5ndGhcblxuICBmb3IoIDsgaiA8IGtsIDsgaisrKSB7XG4gICAgaz1rZXlzW2pdXG4gICAgZW5jb2RlLmJ5dGVzKCBidWZmZXJzLCBrIClcbiAgICBlbmNvZGUuX2VuY29kZSggYnVmZmVycywgZGF0YVtrXSApXG4gIH1cblxuICBidWZmZXJzLnB1c2goIGJ1ZmZfZSApXG59XG5cbmVuY29kZS5saXN0ID0gZnVuY3Rpb24oIGJ1ZmZlcnMsIGRhdGEgKSB7XG5cbiAgdmFyIGkgPSAwLCBqID0gMVxuICB2YXIgYyA9IGRhdGEubGVuZ3RoXG4gIGJ1ZmZlcnMucHVzaCggYnVmZl9sIClcblxuICBmb3IoIDsgaSA8IGM7IGkrKyApIHtcbiAgICBlbmNvZGUuX2VuY29kZSggYnVmZmVycywgZGF0YVtpXSApXG4gIH1cblxuICBidWZmZXJzLnB1c2goIGJ1ZmZfZSApXG5cbn1cblxuLy8gRXhwb3NlXG5tb2R1bGUuZXhwb3J0cyA9IGVuY29kZVxuIiwibW9kdWxlLmV4cG9ydHMgPSByZWVtaXRcbm1vZHVsZS5leHBvcnRzLmZpbHRlciA9IGZpbHRlclxuXG52YXIgRXZlbnRFbWl0dGVyID0gcmVxdWlyZSgnZXZlbnRzJykuRXZlbnRFbWl0dGVyXG5cbmZ1bmN0aW9uIHJlZW1pdCAoc291cmNlLCB0YXJnZXQsIGV2ZW50cykge1xuICBpZiAoIUFycmF5LmlzQXJyYXkoZXZlbnRzKSkgZXZlbnRzID0gWyBldmVudHMgXVxuXG4gIGV2ZW50cy5mb3JFYWNoKGZ1bmN0aW9uIChldmVudCkge1xuICAgIHNvdXJjZS5vbihldmVudCwgZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIGFyZ3MgPSBbXS5zbGljZS5jYWxsKGFyZ3VtZW50cylcbiAgICAgIGFyZ3MudW5zaGlmdChldmVudClcbiAgICAgIHRhcmdldC5lbWl0LmFwcGx5KHRhcmdldCwgYXJncylcbiAgICB9KVxuICB9KVxufVxuXG5mdW5jdGlvbiBmaWx0ZXIgKHNvdXJjZSwgZXZlbnRzKSB7XG4gIHZhciBlbWl0dGVyID0gbmV3IEV2ZW50RW1pdHRlcigpXG4gIHJlZW1pdChzb3VyY2UsIGVtaXR0ZXIsIGV2ZW50cylcbiAgcmV0dXJuIGVtaXR0ZXJcbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKHRhc2tzLCBjYikge1xuICB2YXIgcmVzdWx0cywgcGVuZGluZywga2V5c1xuICBpZiAoQXJyYXkuaXNBcnJheSh0YXNrcykpIHtcbiAgICByZXN1bHRzID0gW11cbiAgICBwZW5kaW5nID0gdGFza3MubGVuZ3RoXG4gIH0gZWxzZSB7XG4gICAga2V5cyA9IE9iamVjdC5rZXlzKHRhc2tzKVxuICAgIHJlc3VsdHMgPSB7fVxuICAgIHBlbmRpbmcgPSBrZXlzLmxlbmd0aFxuICB9XG5cbiAgZnVuY3Rpb24gZG9uZSAoaSwgZXJyLCByZXN1bHQpIHtcbiAgICByZXN1bHRzW2ldID0gcmVzdWx0XG4gICAgaWYgKC0tcGVuZGluZyA9PT0gMCB8fCBlcnIpIHtcbiAgICAgIGNiICYmIGNiKGVyciwgcmVzdWx0cylcbiAgICAgIGNiID0gbnVsbFxuICAgIH1cbiAgfVxuXG4gIGlmICghcGVuZGluZykge1xuICAgIC8vIGVtcHR5XG4gICAgY2IgJiYgY2IobnVsbCwgcmVzdWx0cylcbiAgICBjYiA9IG51bGxcbiAgfSBlbHNlIGlmIChrZXlzKSB7XG4gICAgLy8gb2JqZWN0XG4gICAga2V5cy5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgIHRhc2tzW2tleV0oZG9uZS5iaW5kKHVuZGVmaW5lZCwga2V5KSlcbiAgICB9KVxuICB9IGVsc2Uge1xuICAgIC8vIGFycmF5XG4gICAgdGFza3MuZm9yRWFjaChmdW5jdGlvbiAodGFzaywgaSkge1xuICAgICAgdGFzayhkb25lLmJpbmQodW5kZWZpbmVkLCBpKSlcbiAgICB9KVxuICB9XG59XG4iLCJ2YXIgUnVzaGEgPSByZXF1aXJlKCdydXNoYScpXG5cbnZhciBydXNoYSA9IG5ldyBSdXNoYVxudmFyIGNyeXB0byA9IHdpbmRvdy5jcnlwdG8gfHwgd2luZG93Lm1zQ3J5cHRvIHx8IHt9XG52YXIgc3VidGxlID0gY3J5cHRvLnN1YnRsZSB8fCBjcnlwdG8ud2Via2l0U3VidGxlXG52YXIgc2hhMXN5bmMgPSBydXNoYS5kaWdlc3QuYmluZChydXNoYSlcblxuLy8gQnJvd3NlcnMgdGhyb3cgaWYgdGhleSBsYWNrIHN1cHBvcnQgZm9yIGFuIGFsZ29yaXRobS5cbi8vIFByb21pc2Ugd2lsbCBiZSByZWplY3RlZCBvbiBub24tc2VjdXJlIG9yaWdpbnMuIChodHRwOi8vZ29vLmdsL2xxNGdDbylcbnRyeSB7XG4gIHN1YnRsZS5kaWdlc3QoeyBuYW1lOiAnc2hhLTEnIH0sIG5ldyBVaW50OEFycmF5KS5jYXRjaChmdW5jdGlvbiAoKSB7XG4gICAgc3VidGxlID0gZmFsc2VcbiAgfSlcbn0gY2F0Y2ggKGVycikgeyBzdWJ0bGUgPSBmYWxzZSB9XG5cbmZ1bmN0aW9uIHNoYTEgKGJ1ZiwgY2IpIHtcbiAgaWYgKCFzdWJ0bGUpIHtcbiAgICAvLyBVc2UgUnVzaGFcbiAgICBzZXRUaW1lb3V0KGNiLCAwLCBzaGExc3luYyhidWYpKVxuICAgIHJldHVyblxuICB9XG5cbiAgaWYgKHR5cGVvZiBidWYgPT09ICdzdHJpbmcnKSB7XG4gICAgYnVmID0gdWludDhhcnJheShidWYpXG4gIH1cblxuICBzdWJ0bGUuZGlnZXN0KHsgbmFtZTogJ3NoYS0xJyB9LCBidWYpXG4gICAgLnRoZW4oZnVuY3Rpb24gc3VjY2VlZCAocmVzdWx0KSB7XG4gICAgICBjYihoZXgobmV3IFVpbnQ4QXJyYXkocmVzdWx0KSkpXG4gICAgfSxcbiAgICBmdW5jdGlvbiBmYWlsIChlcnJvcikge1xuICAgICAgY2Ioc2hhMXN5bmMoYnVmKSlcbiAgICB9KVxufVxuXG5mdW5jdGlvbiB1aW50OGFycmF5IChzKSB7XG4gIHZhciBsID0gcy5sZW5ndGhcbiAgdmFyIGFycmF5ID0gbmV3IFVpbnQ4QXJyYXkobClcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsOyBpKyspIHtcbiAgICBhcnJheVtpXSA9IHMuY2hhckNvZGVBdChpKVxuICB9XG4gIHJldHVybiBhcnJheVxufVxuXG5mdW5jdGlvbiBoZXggKGJ1Zikge1xuICB2YXIgbCA9IGJ1Zi5sZW5ndGhcbiAgdmFyIGNoYXJzID0gW11cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsOyBpKyspIHtcbiAgICB2YXIgYml0ZSA9IGJ1ZltpXVxuICAgIGNoYXJzLnB1c2goKGJpdGUgPj4+IDQpLnRvU3RyaW5nKDE2KSlcbiAgICBjaGFycy5wdXNoKChiaXRlICYgMHgwZikudG9TdHJpbmcoMTYpKVxuICB9XG4gIHJldHVybiBjaGFycy5qb2luKCcnKVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHNoYTFcbm1vZHVsZS5leHBvcnRzLnN5bmMgPSBzaGExc3luY1xuIiwiLypcbiAqIFJ1c2hhLCBhIEphdmFTY3JpcHQgaW1wbGVtZW50YXRpb24gb2YgdGhlIFNlY3VyZSBIYXNoIEFsZ29yaXRobSwgU0hBLTEsXG4gKiBhcyBkZWZpbmVkIGluIEZJUFMgUFVCIDE4MC0xLCB0dW5lZCBmb3IgaGlnaCBwZXJmb3JtYW5jZSB3aXRoIGxhcmdlIGlucHV0cy5cbiAqIChodHRwOi8vZ2l0aHViLmNvbS9zcmlqcy9ydXNoYSlcbiAqXG4gKiBJbnNwaXJlZCBieSBQYXVsIEpvaG5zdG9ucyBpbXBsZW1lbnRhdGlvbiAoaHR0cDovL3BhamhvbWUub3JnLnVrL2NyeXB0L21kNSkuXG4gKlxuICogQ29weXJpZ2h0IChjKSAyMDEzIFNhbSBSaWpzIChodHRwOi8vYXdlc2FtLmRlKS5cbiAqIFJlbGVhc2VkIHVuZGVyIHRoZSB0ZXJtcyBvZiB0aGUgTUlUIGxpY2Vuc2UgYXMgZm9sbG93czpcbiAqXG4gKiBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuICogY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZSBcIlNvZnR3YXJlXCIpLFxuICogdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nIHdpdGhvdXQgbGltaXRhdGlvblxuICogdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsXG4gKiBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0IHBlcnNvbnMgdG8gd2hvbSB0aGVcbiAqIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4gKlxuICogVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWQgaW5cbiAqIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuICpcbiAqIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1MgT1JcbiAqIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZLFxuICogRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU4gTk8gRVZFTlQgU0hBTEwgVEhFXG4gKiBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLCBEQU1BR0VTIE9SIE9USEVSXG4gKiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SIE9USEVSV0lTRSwgQVJJU0lOR1xuICogRlJPTSwgT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFIFVTRSBPUiBPVEhFUiBERUFMSU5HU1xuICogSU4gVEhFIFNPRlRXQVJFLlxuICovXG4oZnVuY3Rpb24gKCkge1xuICAgIC8vIElmIHdlJ2UgcnVubmluZyBpbiBOb2RlLkpTLCBleHBvcnQgYSBtb2R1bGUuXG4gICAgaWYgKHR5cGVvZiBtb2R1bGUgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIG1vZHVsZS5leHBvcnRzID0gUnVzaGE7XG4gICAgfSBlbHNlIGlmICh0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICB3aW5kb3cuUnVzaGEgPSBSdXNoYTtcbiAgICB9XG4gICAgLy8gSWYgd2UncmUgcnVubmluZyBpbiBhIHdlYndvcmtlciwgYWNjZXB0XG4gICAgLy8gbWVzc2FnZXMgY29udGFpbmluZyBhIGpvYmlkIGFuZCBhIGJ1ZmZlclxuICAgIC8vIG9yIGJsb2Igb2JqZWN0LCBhbmQgcmV0dXJuIHRoZSBoYXNoIHJlc3VsdC5cbiAgICBpZiAodHlwZW9mIEZpbGVSZWFkZXJTeW5jICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICB2YXIgcmVhZGVyID0gbmV3IEZpbGVSZWFkZXJTeW5jKCksIGhhc2hlciA9IG5ldyBSdXNoYSg0ICogMTAyNCAqIDEwMjQpO1xuICAgICAgICBzZWxmLm9ubWVzc2FnZSA9IGZ1bmN0aW9uIG9uTWVzc2FnZShldmVudCkge1xuICAgICAgICAgICAgdmFyIGhhc2gsIGRhdGEgPSBldmVudC5kYXRhLmRhdGE7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGhhc2ggPSBoYXNoZXIuZGlnZXN0KGRhdGEpO1xuICAgICAgICAgICAgICAgIHNlbGYucG9zdE1lc3NhZ2Uoe1xuICAgICAgICAgICAgICAgICAgICBpZDogZXZlbnQuZGF0YS5pZCxcbiAgICAgICAgICAgICAgICAgICAgaGFzaDogaGFzaFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgIHNlbGYucG9zdE1lc3NhZ2Uoe1xuICAgICAgICAgICAgICAgICAgICBpZDogZXZlbnQuZGF0YS5pZCxcbiAgICAgICAgICAgICAgICAgICAgZXJyb3I6IGUubmFtZVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgIH1cbiAgICB2YXIgdXRpbCA9IHtcbiAgICAgICAgICAgIGdldERhdGFUeXBlOiBmdW5jdGlvbiAoZGF0YSkge1xuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgZGF0YSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuICdzdHJpbmcnO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoZGF0YSBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiAnYXJyYXknO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGdsb2JhbCAhPT0gJ3VuZGVmaW5lZCcgJiYgZ2xvYmFsLkJ1ZmZlciAmJiBnbG9iYWwuQnVmZmVyLmlzQnVmZmVyKGRhdGEpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiAnYnVmZmVyJztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKGRhdGEgaW5zdGFuY2VvZiBBcnJheUJ1ZmZlcikge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gJ2FycmF5YnVmZmVyJztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKGRhdGEuYnVmZmVyIGluc3RhbmNlb2YgQXJyYXlCdWZmZXIpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuICd2aWV3JztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKGRhdGEgaW5zdGFuY2VvZiBCbG9iKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiAnYmxvYic7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignVW5zdXBwb3J0ZWQgZGF0YSB0eXBlLicpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgIC8vIFRoZSBSdXNoYSBvYmplY3QgaXMgYSB3cmFwcGVyIGFyb3VuZCB0aGUgbG93LWxldmVsIFJ1c2hhQ29yZS5cbiAgICAvLyBJdCBwcm92aWRlcyBtZWFucyBvZiBjb252ZXJ0aW5nIGRpZmZlcmVudCBpbnB1dHMgdG8gdGhlXG4gICAgLy8gZm9ybWF0IGFjY2VwdGVkIGJ5IFJ1c2hhQ29yZSBhcyB3ZWxsIGFzIG90aGVyIHV0aWxpdHkgbWV0aG9kcy5cbiAgICBmdW5jdGlvbiBSdXNoYShjaHVua1NpemUpIHtcbiAgICAgICAgJ3VzZSBzdHJpY3QnO1xuICAgICAgICAvLyBQcml2YXRlIG9iamVjdCBzdHJ1Y3R1cmUuXG4gICAgICAgIHZhciBzZWxmJDIgPSB7IGZpbGw6IDAgfTtcbiAgICAgICAgLy8gQ2FsY3VsYXRlIHRoZSBsZW5ndGggb2YgYnVmZmVyIHRoYXQgdGhlIHNoYTEgcm91dGluZSB1c2VzXG4gICAgICAgIC8vIGluY2x1ZGluZyB0aGUgcGFkZGluZy5cbiAgICAgICAgdmFyIHBhZGxlbiA9IGZ1bmN0aW9uIChsZW4pIHtcbiAgICAgICAgICAgIGZvciAobGVuICs9IDk7IGxlbiAlIDY0ID4gMDsgbGVuICs9IDEpO1xuICAgICAgICAgICAgcmV0dXJuIGxlbjtcbiAgICAgICAgfTtcbiAgICAgICAgdmFyIHBhZFplcm9lcyA9IGZ1bmN0aW9uIChiaW4sIGxlbikge1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IGxlbiA+PiAyOyBpIDwgYmluLmxlbmd0aDsgaSsrKVxuICAgICAgICAgICAgICAgIGJpbltpXSA9IDA7XG4gICAgICAgIH07XG4gICAgICAgIHZhciBwYWREYXRhID0gZnVuY3Rpb24gKGJpbiwgY2h1bmtMZW4sIG1zZ0xlbikge1xuICAgICAgICAgICAgYmluW2NodW5rTGVuID4+IDJdIHw9IDEyOCA8PCAyNCAtIChjaHVua0xlbiAlIDQgPDwgMyk7XG4gICAgICAgICAgICBiaW5bKChjaHVua0xlbiA+PiAyKSArIDIgJiB+MTUpICsgMTRdID0gbXNnTGVuID4+IDI5O1xuICAgICAgICAgICAgYmluWygoY2h1bmtMZW4gPj4gMikgKyAyICYgfjE1KSArIDE1XSA9IG1zZ0xlbiA8PCAzO1xuICAgICAgICB9O1xuICAgICAgICAvLyBDb252ZXJ0IGEgYmluYXJ5IHN0cmluZyBhbmQgd3JpdGUgaXQgdG8gdGhlIGhlYXAuXG4gICAgICAgIC8vIEEgYmluYXJ5IHN0cmluZyBpcyBleHBlY3RlZCB0byBvbmx5IGNvbnRhaW4gY2hhciBjb2RlcyA8IDI1Ni5cbiAgICAgICAgdmFyIGNvbnZTdHIgPSBmdW5jdGlvbiAoSDgsIEgzMiwgc3RhcnQsIGxlbiwgb2ZmKSB7XG4gICAgICAgICAgICB2YXIgc3RyID0gdGhpcywgaSwgb20gPSBvZmYgJSA0LCBsbSA9IGxlbiAlIDQsIGogPSBsZW4gLSBsbTtcbiAgICAgICAgICAgIGlmIChqID4gMCkge1xuICAgICAgICAgICAgICAgIHN3aXRjaCAob20pIHtcbiAgICAgICAgICAgICAgICBjYXNlIDA6XG4gICAgICAgICAgICAgICAgICAgIEg4W29mZiArIDMgfCAwXSA9IHN0ci5jaGFyQ29kZUF0KHN0YXJ0KTtcbiAgICAgICAgICAgICAgICBjYXNlIDE6XG4gICAgICAgICAgICAgICAgICAgIEg4W29mZiArIDIgfCAwXSA9IHN0ci5jaGFyQ29kZUF0KHN0YXJ0ICsgMSk7XG4gICAgICAgICAgICAgICAgY2FzZSAyOlxuICAgICAgICAgICAgICAgICAgICBIOFtvZmYgKyAxIHwgMF0gPSBzdHIuY2hhckNvZGVBdChzdGFydCArIDIpO1xuICAgICAgICAgICAgICAgIGNhc2UgMzpcbiAgICAgICAgICAgICAgICAgICAgSDhbb2ZmIHwgMF0gPSBzdHIuY2hhckNvZGVBdChzdGFydCArIDMpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGZvciAoaSA9IG9tOyBpIDwgajsgaSA9IGkgKyA0IHwgMCkge1xuICAgICAgICAgICAgICAgIEgzMltvZmYgKyBpID4+IDJdID0gc3RyLmNoYXJDb2RlQXQoc3RhcnQgKyBpKSA8PCAyNCB8IHN0ci5jaGFyQ29kZUF0KHN0YXJ0ICsgaSArIDEpIDw8IDE2IHwgc3RyLmNoYXJDb2RlQXQoc3RhcnQgKyBpICsgMikgPDwgOCB8IHN0ci5jaGFyQ29kZUF0KHN0YXJ0ICsgaSArIDMpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgc3dpdGNoIChsbSkge1xuICAgICAgICAgICAgY2FzZSAzOlxuICAgICAgICAgICAgICAgIEg4W29mZiArIGogKyAxIHwgMF0gPSBzdHIuY2hhckNvZGVBdChzdGFydCArIGogKyAyKTtcbiAgICAgICAgICAgIGNhc2UgMjpcbiAgICAgICAgICAgICAgICBIOFtvZmYgKyBqICsgMiB8IDBdID0gc3RyLmNoYXJDb2RlQXQoc3RhcnQgKyBqICsgMSk7XG4gICAgICAgICAgICBjYXNlIDE6XG4gICAgICAgICAgICAgICAgSDhbb2ZmICsgaiArIDMgfCAwXSA9IHN0ci5jaGFyQ29kZUF0KHN0YXJ0ICsgaik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIC8vIENvbnZlcnQgYSBidWZmZXIgb3IgYXJyYXkgYW5kIHdyaXRlIGl0IHRvIHRoZSBoZWFwLlxuICAgICAgICAvLyBUaGUgYnVmZmVyIG9yIGFycmF5IGlzIGV4cGVjdGVkIHRvIG9ubHkgY29udGFpbiBlbGVtZW50cyA8IDI1Ni5cbiAgICAgICAgdmFyIGNvbnZCdWYgPSBmdW5jdGlvbiAoSDgsIEgzMiwgc3RhcnQsIGxlbiwgb2ZmKSB7XG4gICAgICAgICAgICB2YXIgYnVmID0gdGhpcywgaSwgb20gPSBvZmYgJSA0LCBsbSA9IGxlbiAlIDQsIGogPSBsZW4gLSBsbTtcbiAgICAgICAgICAgIGlmIChqID4gMCkge1xuICAgICAgICAgICAgICAgIHN3aXRjaCAob20pIHtcbiAgICAgICAgICAgICAgICBjYXNlIDA6XG4gICAgICAgICAgICAgICAgICAgIEg4W29mZiArIDMgfCAwXSA9IGJ1ZltzdGFydF07XG4gICAgICAgICAgICAgICAgY2FzZSAxOlxuICAgICAgICAgICAgICAgICAgICBIOFtvZmYgKyAyIHwgMF0gPSBidWZbc3RhcnQgKyAxXTtcbiAgICAgICAgICAgICAgICBjYXNlIDI6XG4gICAgICAgICAgICAgICAgICAgIEg4W29mZiArIDEgfCAwXSA9IGJ1ZltzdGFydCArIDJdO1xuICAgICAgICAgICAgICAgIGNhc2UgMzpcbiAgICAgICAgICAgICAgICAgICAgSDhbb2ZmIHwgMF0gPSBidWZbc3RhcnQgKyAzXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBmb3IgKGkgPSA0IC0gb207IGkgPCBqOyBpID0gaSArPSA0IHwgMCkge1xuICAgICAgICAgICAgICAgIEgzMltvZmYgKyBpID4+IDJdID0gYnVmW3N0YXJ0ICsgaV0gPDwgMjQgfCBidWZbc3RhcnQgKyBpICsgMV0gPDwgMTYgfCBidWZbc3RhcnQgKyBpICsgMl0gPDwgOCB8IGJ1ZltzdGFydCArIGkgKyAzXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHN3aXRjaCAobG0pIHtcbiAgICAgICAgICAgIGNhc2UgMzpcbiAgICAgICAgICAgICAgICBIOFtvZmYgKyBqICsgMSB8IDBdID0gYnVmW3N0YXJ0ICsgaiArIDJdO1xuICAgICAgICAgICAgY2FzZSAyOlxuICAgICAgICAgICAgICAgIEg4W29mZiArIGogKyAyIHwgMF0gPSBidWZbc3RhcnQgKyBqICsgMV07XG4gICAgICAgICAgICBjYXNlIDE6XG4gICAgICAgICAgICAgICAgSDhbb2ZmICsgaiArIDMgfCAwXSA9IGJ1ZltzdGFydCArIGpdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICB2YXIgY29udkJsb2IgPSBmdW5jdGlvbiAoSDgsIEgzMiwgc3RhcnQsIGxlbiwgb2ZmKSB7XG4gICAgICAgICAgICB2YXIgYmxvYiA9IHRoaXMsIGksIG9tID0gb2ZmICUgNCwgbG0gPSBsZW4gJSA0LCBqID0gbGVuIC0gbG07XG4gICAgICAgICAgICB2YXIgYnVmID0gbmV3IFVpbnQ4QXJyYXkocmVhZGVyLnJlYWRBc0FycmF5QnVmZmVyKGJsb2Iuc2xpY2Uoc3RhcnQsIHN0YXJ0ICsgbGVuKSkpO1xuICAgICAgICAgICAgaWYgKGogPiAwKSB7XG4gICAgICAgICAgICAgICAgc3dpdGNoIChvbSkge1xuICAgICAgICAgICAgICAgIGNhc2UgMDpcbiAgICAgICAgICAgICAgICAgICAgSDhbb2ZmICsgMyB8IDBdID0gYnVmWzBdO1xuICAgICAgICAgICAgICAgIGNhc2UgMTpcbiAgICAgICAgICAgICAgICAgICAgSDhbb2ZmICsgMiB8IDBdID0gYnVmWzFdO1xuICAgICAgICAgICAgICAgIGNhc2UgMjpcbiAgICAgICAgICAgICAgICAgICAgSDhbb2ZmICsgMSB8IDBdID0gYnVmWzJdO1xuICAgICAgICAgICAgICAgIGNhc2UgMzpcbiAgICAgICAgICAgICAgICAgICAgSDhbb2ZmIHwgMF0gPSBidWZbM107XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZm9yIChpID0gNCAtIG9tOyBpIDwgajsgaSA9IGkgKz0gNCB8IDApIHtcbiAgICAgICAgICAgICAgICBIMzJbb2ZmICsgaSA+PiAyXSA9IGJ1ZltpXSA8PCAyNCB8IGJ1ZltpICsgMV0gPDwgMTYgfCBidWZbaSArIDJdIDw8IDggfCBidWZbaSArIDNdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgc3dpdGNoIChsbSkge1xuICAgICAgICAgICAgY2FzZSAzOlxuICAgICAgICAgICAgICAgIEg4W29mZiArIGogKyAxIHwgMF0gPSBidWZbaiArIDJdO1xuICAgICAgICAgICAgY2FzZSAyOlxuICAgICAgICAgICAgICAgIEg4W29mZiArIGogKyAyIHwgMF0gPSBidWZbaiArIDFdO1xuICAgICAgICAgICAgY2FzZSAxOlxuICAgICAgICAgICAgICAgIEg4W29mZiArIGogKyAzIHwgMF0gPSBidWZbal07XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHZhciBjb252Rm4gPSBmdW5jdGlvbiAoZGF0YSkge1xuICAgICAgICAgICAgc3dpdGNoICh1dGlsLmdldERhdGFUeXBlKGRhdGEpKSB7XG4gICAgICAgICAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgICAgICAgICAgIHJldHVybiBjb252U3RyLmJpbmQoZGF0YSk7XG4gICAgICAgICAgICBjYXNlICdhcnJheSc6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNvbnZCdWYuYmluZChkYXRhKTtcbiAgICAgICAgICAgIGNhc2UgJ2J1ZmZlcic6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNvbnZCdWYuYmluZChkYXRhKTtcbiAgICAgICAgICAgIGNhc2UgJ2FycmF5YnVmZmVyJzpcbiAgICAgICAgICAgICAgICByZXR1cm4gY29udkJ1Zi5iaW5kKG5ldyBVaW50OEFycmF5KGRhdGEpKTtcbiAgICAgICAgICAgIGNhc2UgJ3ZpZXcnOlxuICAgICAgICAgICAgICAgIHJldHVybiBjb252QnVmLmJpbmQobmV3IFVpbnQ4QXJyYXkoZGF0YS5idWZmZXIsIGRhdGEuYnl0ZU9mZnNldCwgZGF0YS5ieXRlTGVuZ3RoKSk7XG4gICAgICAgICAgICBjYXNlICdibG9iJzpcbiAgICAgICAgICAgICAgICByZXR1cm4gY29udkJsb2IuYmluZChkYXRhKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgdmFyIHNsaWNlID0gZnVuY3Rpb24gKGRhdGEsIG9mZnNldCkge1xuICAgICAgICAgICAgc3dpdGNoICh1dGlsLmdldERhdGFUeXBlKGRhdGEpKSB7XG4gICAgICAgICAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgICAgICAgICAgIHJldHVybiBkYXRhLnNsaWNlKG9mZnNldCk7XG4gICAgICAgICAgICBjYXNlICdhcnJheSc6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGRhdGEuc2xpY2Uob2Zmc2V0KTtcbiAgICAgICAgICAgIGNhc2UgJ2J1ZmZlcic6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGRhdGEuc2xpY2Uob2Zmc2V0KTtcbiAgICAgICAgICAgIGNhc2UgJ2FycmF5YnVmZmVyJzpcbiAgICAgICAgICAgICAgICByZXR1cm4gZGF0YS5zbGljZShvZmZzZXQpO1xuICAgICAgICAgICAgY2FzZSAndmlldyc6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGRhdGEuYnVmZmVyLnNsaWNlKG9mZnNldCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIC8vIENvbnZlcnQgYW4gQXJyYXlCdWZmZXIgaW50byBpdHMgaGV4YWRlY2ltYWwgc3RyaW5nIHJlcHJlc2VudGF0aW9uLlxuICAgICAgICB2YXIgaGV4ID0gZnVuY3Rpb24gKGFycmF5QnVmZmVyKSB7XG4gICAgICAgICAgICB2YXIgaSwgeCwgaGV4X3RhYiA9ICcwMTIzNDU2Nzg5YWJjZGVmJywgcmVzID0gW10sIGJpbmFycmF5ID0gbmV3IFVpbnQ4QXJyYXkoYXJyYXlCdWZmZXIpO1xuICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IGJpbmFycmF5Lmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgeCA9IGJpbmFycmF5W2ldO1xuICAgICAgICAgICAgICAgIHJlc1tpXSA9IGhleF90YWIuY2hhckF0KHggPj4gNCAmIDE1KSArIGhleF90YWIuY2hhckF0KHggPj4gMCAmIDE1KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiByZXMuam9pbignJyk7XG4gICAgICAgIH07XG4gICAgICAgIHZhciBjZWlsSGVhcFNpemUgPSBmdW5jdGlvbiAodikge1xuICAgICAgICAgICAgLy8gVGhlIGFzbS5qcyBzcGVjIHNheXM6XG4gICAgICAgICAgICAvLyBUaGUgaGVhcCBvYmplY3QncyBieXRlTGVuZ3RoIG11c3QgYmUgZWl0aGVyXG4gICAgICAgICAgICAvLyAyXm4gZm9yIG4gaW4gWzEyLCAyNCkgb3IgMl4yNCAqIG4gZm9yIG4g4omlIDEuXG4gICAgICAgICAgICAvLyBBbHNvLCBieXRlTGVuZ3RocyBzbWFsbGVyIHRoYW4gMl4xNiBhcmUgZGVwcmVjYXRlZC5cbiAgICAgICAgICAgIHZhciBwO1xuICAgICAgICAgICAgLy8gSWYgdiBpcyBzbWFsbGVyIHRoYW4gMl4xNiwgdGhlIHNtYWxsZXN0IHBvc3NpYmxlIHNvbHV0aW9uXG4gICAgICAgICAgICAvLyBpcyAyXjE2LlxuICAgICAgICAgICAgaWYgKHYgPD0gNjU1MzYpXG4gICAgICAgICAgICAgICAgcmV0dXJuIDY1NTM2O1xuICAgICAgICAgICAgLy8gSWYgdiA8IDJeMjQsIHdlIHJvdW5kIHVwIHRvIDJebixcbiAgICAgICAgICAgIC8vIG90aGVyd2lzZSB3ZSByb3VuZCB1cCB0byAyXjI0ICogbi5cbiAgICAgICAgICAgIGlmICh2IDwgMTY3NzcyMTYpIHtcbiAgICAgICAgICAgICAgICBmb3IgKHAgPSAxOyBwIDwgdjsgcCA9IHAgPDwgMSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGZvciAocCA9IDE2Nzc3MjE2OyBwIDwgdjsgcCArPSAxNjc3NzIxNik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gcDtcbiAgICAgICAgfTtcbiAgICAgICAgLy8gSW5pdGlhbGl6ZSB0aGUgaW50ZXJuYWwgZGF0YSBzdHJ1Y3R1cmVzIHRvIGEgbmV3IGNhcGFjaXR5LlxuICAgICAgICB2YXIgaW5pdCA9IGZ1bmN0aW9uIChzaXplKSB7XG4gICAgICAgICAgICBpZiAoc2l6ZSAlIDY0ID4gMCkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignQ2h1bmsgc2l6ZSBtdXN0IGJlIGEgbXVsdGlwbGUgb2YgMTI4IGJpdCcpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgc2VsZiQyLm1heENodW5rTGVuID0gc2l6ZTtcbiAgICAgICAgICAgIHNlbGYkMi5wYWRNYXhDaHVua0xlbiA9IHBhZGxlbihzaXplKTtcbiAgICAgICAgICAgIC8vIFRoZSBzaXplIG9mIHRoZSBoZWFwIGlzIHRoZSBzdW0gb2Y6XG4gICAgICAgICAgICAvLyAxLiBUaGUgcGFkZGVkIGlucHV0IG1lc3NhZ2Ugc2l6ZVxuICAgICAgICAgICAgLy8gMi4gVGhlIGV4dGVuZGVkIHNwYWNlIHRoZSBhbGdvcml0aG0gbmVlZHMgKDMyMCBieXRlKVxuICAgICAgICAgICAgLy8gMy4gVGhlIDE2MCBiaXQgc3RhdGUgdGhlIGFsZ29yaXRtIHVzZXNcbiAgICAgICAgICAgIHNlbGYkMi5oZWFwID0gbmV3IEFycmF5QnVmZmVyKGNlaWxIZWFwU2l6ZShzZWxmJDIucGFkTWF4Q2h1bmtMZW4gKyAzMjAgKyAyMCkpO1xuICAgICAgICAgICAgc2VsZiQyLmgzMiA9IG5ldyBJbnQzMkFycmF5KHNlbGYkMi5oZWFwKTtcbiAgICAgICAgICAgIHNlbGYkMi5oOCA9IG5ldyBJbnQ4QXJyYXkoc2VsZiQyLmhlYXApO1xuICAgICAgICAgICAgc2VsZiQyLmNvcmUgPSBSdXNoYUNvcmUoe1xuICAgICAgICAgICAgICAgIEludDMyQXJyYXk6IEludDMyQXJyYXksXG4gICAgICAgICAgICAgICAgRGF0YVZpZXc6IERhdGFWaWV3XG4gICAgICAgICAgICB9LCB7fSwgc2VsZiQyLmhlYXApO1xuICAgICAgICAgICAgc2VsZiQyLmJ1ZmZlciA9IG51bGw7XG4gICAgICAgIH07XG4gICAgICAgIC8vIElpbml0aWFsaXpldGhlIGRhdGFzdHJ1Y3R1cmVzIGFjY29yZGluZ1xuICAgICAgICAvLyB0byBhIGNodW5rIHNpeXplLlxuICAgICAgICBpbml0KGNodW5rU2l6ZSB8fCA2NCAqIDEwMjQpO1xuICAgICAgICB2YXIgaW5pdFN0YXRlID0gZnVuY3Rpb24gKGhlYXAsIHBhZE1zZ0xlbikge1xuICAgICAgICAgICAgdmFyIGlvID0gbmV3IEludDMyQXJyYXkoaGVhcCwgcGFkTXNnTGVuICsgMzIwLCA1KTtcbiAgICAgICAgICAgIGlvWzBdID0gMTczMjU4NDE5MztcbiAgICAgICAgICAgIGlvWzFdID0gLTI3MTczMzg3OTtcbiAgICAgICAgICAgIGlvWzJdID0gLTE3MzI1ODQxOTQ7XG4gICAgICAgICAgICBpb1szXSA9IDI3MTczMzg3ODtcbiAgICAgICAgICAgIGlvWzRdID0gLTEwMDk1ODk3NzY7XG4gICAgICAgIH07XG4gICAgICAgIHZhciBwYWRDaHVuayA9IGZ1bmN0aW9uIChjaHVua0xlbiwgbXNnTGVuKSB7XG4gICAgICAgICAgICB2YXIgcGFkQ2h1bmtMZW4gPSBwYWRsZW4oY2h1bmtMZW4pO1xuICAgICAgICAgICAgdmFyIHZpZXcgPSBuZXcgSW50MzJBcnJheShzZWxmJDIuaGVhcCwgMCwgcGFkQ2h1bmtMZW4gPj4gMik7XG4gICAgICAgICAgICBwYWRaZXJvZXModmlldywgY2h1bmtMZW4pO1xuICAgICAgICAgICAgcGFkRGF0YSh2aWV3LCBjaHVua0xlbiwgbXNnTGVuKTtcbiAgICAgICAgICAgIHJldHVybiBwYWRDaHVua0xlbjtcbiAgICAgICAgfTtcbiAgICAgICAgLy8gV3JpdGUgZGF0YSB0byB0aGUgaGVhcC5cbiAgICAgICAgdmFyIHdyaXRlID0gZnVuY3Rpb24gKGRhdGEsIGNodW5rT2Zmc2V0LCBjaHVua0xlbikge1xuICAgICAgICAgICAgY29udkZuKGRhdGEpKHNlbGYkMi5oOCwgc2VsZiQyLmgzMiwgY2h1bmtPZmZzZXQsIGNodW5rTGVuLCAwKTtcbiAgICAgICAgfTtcbiAgICAgICAgLy8gSW5pdGlhbGl6ZSBhbmQgY2FsbCB0aGUgUnVzaGFDb3JlLFxuICAgICAgICAvLyBhc3N1bWluZyBhbiBpbnB1dCBidWZmZXIgb2YgbGVuZ3RoIGxlbiAqIDQuXG4gICAgICAgIHZhciBjb3JlQ2FsbCA9IGZ1bmN0aW9uIChkYXRhLCBjaHVua09mZnNldCwgY2h1bmtMZW4sIG1zZ0xlbiwgZmluYWxpemUpIHtcbiAgICAgICAgICAgIHZhciBwYWRDaHVua0xlbiA9IGNodW5rTGVuO1xuICAgICAgICAgICAgaWYgKGZpbmFsaXplKSB7XG4gICAgICAgICAgICAgICAgcGFkQ2h1bmtMZW4gPSBwYWRDaHVuayhjaHVua0xlbiwgbXNnTGVuKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHdyaXRlKGRhdGEsIGNodW5rT2Zmc2V0LCBjaHVua0xlbik7XG4gICAgICAgICAgICBzZWxmJDIuY29yZS5oYXNoKHBhZENodW5rTGVuLCBzZWxmJDIucGFkTWF4Q2h1bmtMZW4pO1xuICAgICAgICB9O1xuICAgICAgICB2YXIgZ2V0UmF3RGlnZXN0ID0gZnVuY3Rpb24gKGhlYXAsIHBhZE1heENodW5rTGVuKSB7XG4gICAgICAgICAgICB2YXIgaW8gPSBuZXcgSW50MzJBcnJheShoZWFwLCBwYWRNYXhDaHVua0xlbiArIDMyMCwgNSk7XG4gICAgICAgICAgICB2YXIgb3V0ID0gbmV3IEludDMyQXJyYXkoNSk7XG4gICAgICAgICAgICB2YXIgYXJyID0gbmV3IERhdGFWaWV3KG91dC5idWZmZXIpO1xuICAgICAgICAgICAgYXJyLnNldEludDMyKDAsIGlvWzBdLCBmYWxzZSk7XG4gICAgICAgICAgICBhcnIuc2V0SW50MzIoNCwgaW9bMV0sIGZhbHNlKTtcbiAgICAgICAgICAgIGFyci5zZXRJbnQzMig4LCBpb1syXSwgZmFsc2UpO1xuICAgICAgICAgICAgYXJyLnNldEludDMyKDEyLCBpb1szXSwgZmFsc2UpO1xuICAgICAgICAgICAgYXJyLnNldEludDMyKDE2LCBpb1s0XSwgZmFsc2UpO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfTtcbiAgICAgICAgLy8gQ2FsY3VsYXRlIHRoZSBoYXNoIGRpZ2VzdCBhcyBhbiBhcnJheSBvZiA1IDMyYml0IGludGVnZXJzLlxuICAgICAgICB2YXIgcmF3RGlnZXN0ID0gdGhpcy5yYXdEaWdlc3QgPSBmdW5jdGlvbiAoc3RyKSB7XG4gICAgICAgICAgICAgICAgdmFyIG1zZ0xlbiA9IHN0ci5ieXRlTGVuZ3RoIHx8IHN0ci5sZW5ndGggfHwgc3RyLnNpemUgfHwgMDtcbiAgICAgICAgICAgICAgICBpbml0U3RhdGUoc2VsZiQyLmhlYXAsIHNlbGYkMi5wYWRNYXhDaHVua0xlbik7XG4gICAgICAgICAgICAgICAgdmFyIGNodW5rT2Zmc2V0ID0gMCwgY2h1bmtMZW4gPSBzZWxmJDIubWF4Q2h1bmtMZW4sIGxhc3Q7XG4gICAgICAgICAgICAgICAgZm9yIChjaHVua09mZnNldCA9IDA7IG1zZ0xlbiA+IGNodW5rT2Zmc2V0ICsgY2h1bmtMZW47IGNodW5rT2Zmc2V0ICs9IGNodW5rTGVuKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvcmVDYWxsKHN0ciwgY2h1bmtPZmZzZXQsIGNodW5rTGVuLCBtc2dMZW4sIGZhbHNlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29yZUNhbGwoc3RyLCBjaHVua09mZnNldCwgbXNnTGVuIC0gY2h1bmtPZmZzZXQsIG1zZ0xlbiwgdHJ1ZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGdldFJhd0RpZ2VzdChzZWxmJDIuaGVhcCwgc2VsZiQyLnBhZE1heENodW5rTGVuKTtcbiAgICAgICAgICAgIH07XG4gICAgICAgIC8vIFRoZSBkaWdlc3QgYW5kIGRpZ2VzdEZyb20qIGludGVyZmFjZSByZXR1cm5zIHRoZSBoYXNoIGRpZ2VzdFxuICAgICAgICAvLyBhcyBhIGhleCBzdHJpbmcuXG4gICAgICAgIHRoaXMuZGlnZXN0ID0gdGhpcy5kaWdlc3RGcm9tU3RyaW5nID0gdGhpcy5kaWdlc3RGcm9tQnVmZmVyID0gdGhpcy5kaWdlc3RGcm9tQXJyYXlCdWZmZXIgPSBmdW5jdGlvbiAoc3RyKSB7XG4gICAgICAgICAgICByZXR1cm4gaGV4KHJhd0RpZ2VzdChzdHIpLmJ1ZmZlcik7XG4gICAgICAgIH07XG4gICAgfVxuICAgIDtcbiAgICAvLyBUaGUgbG93LWxldmVsIFJ1c2hDb3JlIG1vZHVsZSBwcm92aWRlcyB0aGUgaGVhcnQgb2YgUnVzaGEsXG4gICAgLy8gYSBoaWdoLXNwZWVkIHNoYTEgaW1wbGVtZW50YXRpb24gd29ya2luZyBvbiBhbiBJbnQzMkFycmF5IGhlYXAuXG4gICAgLy8gQXQgZmlyc3QgZ2xhbmNlLCB0aGUgaW1wbGVtZW50YXRpb24gc2VlbXMgY29tcGxpY2F0ZWQsIGhvd2V2ZXJcbiAgICAvLyB3aXRoIHRoZSBTSEExIHNwZWMgYXQgaGFuZCwgaXQgaXMgb2J2aW91cyB0aGlzIGFsbW9zdCBhIHRleHRib29rXG4gICAgLy8gaW1wbGVtZW50YXRpb24gdGhhdCBoYXMgYSBmZXcgZnVuY3Rpb25zIGhhbmQtaW5saW5lZCBhbmQgYSBmZXcgbG9vcHNcbiAgICAvLyBoYW5kLXVucm9sbGVkLlxuICAgIGZ1bmN0aW9uIFJ1c2hhQ29yZShzdGRsaWIsIGZvcmVpZ24sIGhlYXApIHtcbiAgICAgICAgJ3VzZSBhc20nO1xuICAgICAgICB2YXIgSCA9IG5ldyBzdGRsaWIuSW50MzJBcnJheShoZWFwKTtcbiAgICAgICAgZnVuY3Rpb24gaGFzaChrLCB4KSB7XG4gICAgICAgICAgICAvLyBrIGluIGJ5dGVzXG4gICAgICAgICAgICBrID0gayB8IDA7XG4gICAgICAgICAgICB4ID0geCB8IDA7XG4gICAgICAgICAgICB2YXIgaSA9IDAsIGogPSAwLCB5MCA9IDAsIHowID0gMCwgeTEgPSAwLCB6MSA9IDAsIHkyID0gMCwgejIgPSAwLCB5MyA9IDAsIHozID0gMCwgeTQgPSAwLCB6NCA9IDAsIHQwID0gMCwgdDEgPSAwO1xuICAgICAgICAgICAgeTAgPSBIW3ggKyAzMjAgPj4gMl0gfCAwO1xuICAgICAgICAgICAgeTEgPSBIW3ggKyAzMjQgPj4gMl0gfCAwO1xuICAgICAgICAgICAgeTIgPSBIW3ggKyAzMjggPj4gMl0gfCAwO1xuICAgICAgICAgICAgeTMgPSBIW3ggKyAzMzIgPj4gMl0gfCAwO1xuICAgICAgICAgICAgeTQgPSBIW3ggKyAzMzYgPj4gMl0gfCAwO1xuICAgICAgICAgICAgZm9yIChpID0gMDsgKGkgfCAwKSA8IChrIHwgMCk7IGkgPSBpICsgNjQgfCAwKSB7XG4gICAgICAgICAgICAgICAgejAgPSB5MDtcbiAgICAgICAgICAgICAgICB6MSA9IHkxO1xuICAgICAgICAgICAgICAgIHoyID0geTI7XG4gICAgICAgICAgICAgICAgejMgPSB5MztcbiAgICAgICAgICAgICAgICB6NCA9IHk0O1xuICAgICAgICAgICAgICAgIGZvciAoaiA9IDA7IChqIHwgMCkgPCA2NDsgaiA9IGogKyA0IHwgMCkge1xuICAgICAgICAgICAgICAgICAgICB0MSA9IEhbaSArIGogPj4gMl0gfCAwO1xuICAgICAgICAgICAgICAgICAgICB0MCA9ICgoeTAgPDwgNSB8IHkwID4+PiAyNykgKyAoeTEgJiB5MiB8IH55MSAmIHkzKSB8IDApICsgKCh0MSArIHk0IHwgMCkgKyAxNTE4NTAwMjQ5IHwgMCkgfCAwO1xuICAgICAgICAgICAgICAgICAgICB5NCA9IHkzO1xuICAgICAgICAgICAgICAgICAgICB5MyA9IHkyO1xuICAgICAgICAgICAgICAgICAgICB5MiA9IHkxIDw8IDMwIHwgeTEgPj4+IDI7XG4gICAgICAgICAgICAgICAgICAgIHkxID0geTA7XG4gICAgICAgICAgICAgICAgICAgIHkwID0gdDA7XG4gICAgICAgICAgICAgICAgICAgIDtcbiAgICAgICAgICAgICAgICAgICAgSFtrICsgaiA+PiAyXSA9IHQxO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBmb3IgKGogPSBrICsgNjQgfCAwOyAoaiB8IDApIDwgKGsgKyA4MCB8IDApOyBqID0gaiArIDQgfCAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHQxID0gKEhbaiAtIDEyID4+IDJdIF4gSFtqIC0gMzIgPj4gMl0gXiBIW2ogLSA1NiA+PiAyXSBeIEhbaiAtIDY0ID4+IDJdKSA8PCAxIHwgKEhbaiAtIDEyID4+IDJdIF4gSFtqIC0gMzIgPj4gMl0gXiBIW2ogLSA1NiA+PiAyXSBeIEhbaiAtIDY0ID4+IDJdKSA+Pj4gMzE7XG4gICAgICAgICAgICAgICAgICAgIHQwID0gKCh5MCA8PCA1IHwgeTAgPj4+IDI3KSArICh5MSAmIHkyIHwgfnkxICYgeTMpIHwgMCkgKyAoKHQxICsgeTQgfCAwKSArIDE1MTg1MDAyNDkgfCAwKSB8IDA7XG4gICAgICAgICAgICAgICAgICAgIHk0ID0geTM7XG4gICAgICAgICAgICAgICAgICAgIHkzID0geTI7XG4gICAgICAgICAgICAgICAgICAgIHkyID0geTEgPDwgMzAgfCB5MSA+Pj4gMjtcbiAgICAgICAgICAgICAgICAgICAgeTEgPSB5MDtcbiAgICAgICAgICAgICAgICAgICAgeTAgPSB0MDtcbiAgICAgICAgICAgICAgICAgICAgO1xuICAgICAgICAgICAgICAgICAgICBIW2ogPj4gMl0gPSB0MTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZm9yIChqID0gayArIDgwIHwgMDsgKGogfCAwKSA8IChrICsgMTYwIHwgMCk7IGogPSBqICsgNCB8IDApIHtcbiAgICAgICAgICAgICAgICAgICAgdDEgPSAoSFtqIC0gMTIgPj4gMl0gXiBIW2ogLSAzMiA+PiAyXSBeIEhbaiAtIDU2ID4+IDJdIF4gSFtqIC0gNjQgPj4gMl0pIDw8IDEgfCAoSFtqIC0gMTIgPj4gMl0gXiBIW2ogLSAzMiA+PiAyXSBeIEhbaiAtIDU2ID4+IDJdIF4gSFtqIC0gNjQgPj4gMl0pID4+PiAzMTtcbiAgICAgICAgICAgICAgICAgICAgdDAgPSAoKHkwIDw8IDUgfCB5MCA+Pj4gMjcpICsgKHkxIF4geTIgXiB5MykgfCAwKSArICgodDEgKyB5NCB8IDApICsgMTg1OTc3NTM5MyB8IDApIHwgMDtcbiAgICAgICAgICAgICAgICAgICAgeTQgPSB5MztcbiAgICAgICAgICAgICAgICAgICAgeTMgPSB5MjtcbiAgICAgICAgICAgICAgICAgICAgeTIgPSB5MSA8PCAzMCB8IHkxID4+PiAyO1xuICAgICAgICAgICAgICAgICAgICB5MSA9IHkwO1xuICAgICAgICAgICAgICAgICAgICB5MCA9IHQwO1xuICAgICAgICAgICAgICAgICAgICA7XG4gICAgICAgICAgICAgICAgICAgIEhbaiA+PiAyXSA9IHQxO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBmb3IgKGogPSBrICsgMTYwIHwgMDsgKGogfCAwKSA8IChrICsgMjQwIHwgMCk7IGogPSBqICsgNCB8IDApIHtcbiAgICAgICAgICAgICAgICAgICAgdDEgPSAoSFtqIC0gMTIgPj4gMl0gXiBIW2ogLSAzMiA+PiAyXSBeIEhbaiAtIDU2ID4+IDJdIF4gSFtqIC0gNjQgPj4gMl0pIDw8IDEgfCAoSFtqIC0gMTIgPj4gMl0gXiBIW2ogLSAzMiA+PiAyXSBeIEhbaiAtIDU2ID4+IDJdIF4gSFtqIC0gNjQgPj4gMl0pID4+PiAzMTtcbiAgICAgICAgICAgICAgICAgICAgdDAgPSAoKHkwIDw8IDUgfCB5MCA+Pj4gMjcpICsgKHkxICYgeTIgfCB5MSAmIHkzIHwgeTIgJiB5MykgfCAwKSArICgodDEgKyB5NCB8IDApIC0gMTg5NDAwNzU4OCB8IDApIHwgMDtcbiAgICAgICAgICAgICAgICAgICAgeTQgPSB5MztcbiAgICAgICAgICAgICAgICAgICAgeTMgPSB5MjtcbiAgICAgICAgICAgICAgICAgICAgeTIgPSB5MSA8PCAzMCB8IHkxID4+PiAyO1xuICAgICAgICAgICAgICAgICAgICB5MSA9IHkwO1xuICAgICAgICAgICAgICAgICAgICB5MCA9IHQwO1xuICAgICAgICAgICAgICAgICAgICA7XG4gICAgICAgICAgICAgICAgICAgIEhbaiA+PiAyXSA9IHQxO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBmb3IgKGogPSBrICsgMjQwIHwgMDsgKGogfCAwKSA8IChrICsgMzIwIHwgMCk7IGogPSBqICsgNCB8IDApIHtcbiAgICAgICAgICAgICAgICAgICAgdDEgPSAoSFtqIC0gMTIgPj4gMl0gXiBIW2ogLSAzMiA+PiAyXSBeIEhbaiAtIDU2ID4+IDJdIF4gSFtqIC0gNjQgPj4gMl0pIDw8IDEgfCAoSFtqIC0gMTIgPj4gMl0gXiBIW2ogLSAzMiA+PiAyXSBeIEhbaiAtIDU2ID4+IDJdIF4gSFtqIC0gNjQgPj4gMl0pID4+PiAzMTtcbiAgICAgICAgICAgICAgICAgICAgdDAgPSAoKHkwIDw8IDUgfCB5MCA+Pj4gMjcpICsgKHkxIF4geTIgXiB5MykgfCAwKSArICgodDEgKyB5NCB8IDApIC0gODk5NDk3NTE0IHwgMCkgfCAwO1xuICAgICAgICAgICAgICAgICAgICB5NCA9IHkzO1xuICAgICAgICAgICAgICAgICAgICB5MyA9IHkyO1xuICAgICAgICAgICAgICAgICAgICB5MiA9IHkxIDw8IDMwIHwgeTEgPj4+IDI7XG4gICAgICAgICAgICAgICAgICAgIHkxID0geTA7XG4gICAgICAgICAgICAgICAgICAgIHkwID0gdDA7XG4gICAgICAgICAgICAgICAgICAgIDtcbiAgICAgICAgICAgICAgICAgICAgSFtqID4+IDJdID0gdDE7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHkwID0geTAgKyB6MCB8IDA7XG4gICAgICAgICAgICAgICAgeTEgPSB5MSArIHoxIHwgMDtcbiAgICAgICAgICAgICAgICB5MiA9IHkyICsgejIgfCAwO1xuICAgICAgICAgICAgICAgIHkzID0geTMgKyB6MyB8IDA7XG4gICAgICAgICAgICAgICAgeTQgPSB5NCArIHo0IHwgMDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIEhbeCArIDMyMCA+PiAyXSA9IHkwO1xuICAgICAgICAgICAgSFt4ICsgMzI0ID4+IDJdID0geTE7XG4gICAgICAgICAgICBIW3ggKyAzMjggPj4gMl0gPSB5MjtcbiAgICAgICAgICAgIEhbeCArIDMzMiA+PiAyXSA9IHkzO1xuICAgICAgICAgICAgSFt4ICsgMzM2ID4+IDJdID0geTQ7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgaGFzaDogaGFzaCB9O1xuICAgIH1cbn0oKSk7IiwidmFyIHRpY2sgPSAxXG52YXIgbWF4VGljayA9IDY1NTM1XG52YXIgcmVzb2x1dGlvbiA9IDRcbnZhciBpbmMgPSBmdW5jdGlvbigpIHtcbiAgdGljayA9ICh0aWNrICsgMSkgJiBtYXhUaWNrXG59XG5cbnZhciB0aW1lciA9IHNldEludGVydmFsKGluYywgKDEwMDAgLyByZXNvbHV0aW9uKSB8IDApXG5pZiAodGltZXIudW5yZWYpIHRpbWVyLnVucmVmKClcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihzZWNvbmRzKSB7XG4gIHZhciBzaXplID0gcmVzb2x1dGlvbiAqIChzZWNvbmRzIHx8IDUpXG4gIHZhciBidWZmZXIgPSBbMF1cbiAgdmFyIHBvaW50ZXIgPSAxXG4gIHZhciBsYXN0ID0gKHRpY2stMSkgJiBtYXhUaWNrXG5cbiAgcmV0dXJuIGZ1bmN0aW9uKGRlbHRhKSB7XG4gICAgdmFyIGRpc3QgPSAodGljayAtIGxhc3QpICYgbWF4VGlja1xuICAgIGlmIChkaXN0ID4gc2l6ZSkgZGlzdCA9IHNpemVcbiAgICBsYXN0ID0gdGlja1xuXG4gICAgd2hpbGUgKGRpc3QtLSkge1xuICAgICAgaWYgKHBvaW50ZXIgPT09IHNpemUpIHBvaW50ZXIgPSAwXG4gICAgICBidWZmZXJbcG9pbnRlcl0gPSBidWZmZXJbcG9pbnRlciA9PT0gMCA/IHNpemUtMSA6IHBvaW50ZXItMV1cbiAgICAgIHBvaW50ZXIrK1xuICAgIH1cblxuICAgIGlmIChkZWx0YSkgYnVmZmVyW3BvaW50ZXItMV0gKz0gZGVsdGFcblxuICAgIHZhciB0b3AgPSBidWZmZXJbcG9pbnRlci0xXVxuICAgIHZhciBidG0gPSBidWZmZXIubGVuZ3RoIDwgc2l6ZSA/IDAgOiBidWZmZXJbcG9pbnRlciA9PT0gc2l6ZSA/IDAgOiBwb2ludGVyXVxuXG4gICAgcmV0dXJuIGJ1ZmZlci5sZW5ndGggPCByZXNvbHV0aW9uID8gdG9wIDogKHRvcCAtIGJ0bSkgKiByZXNvbHV0aW9uIC8gYnVmZmVyLmxlbmd0aFxuICB9XG59IiwibW9kdWxlLmV4cG9ydHMgPSBEaXNjb3ZlcnlcblxudmFyIGRlYnVnID0gcmVxdWlyZSgnZGVidWcnKSgndG9ycmVudC1kaXNjb3ZlcnknKVxudmFyIERIVCA9IHJlcXVpcmUoJ2JpdHRvcnJlbnQtZGh0L2NsaWVudCcpIC8vIGVtcHR5IG9iamVjdCBpbiBicm93c2VyXG52YXIgRXZlbnRFbWl0dGVyID0gcmVxdWlyZSgnZXZlbnRzJykuRXZlbnRFbWl0dGVyXG52YXIgZXh0ZW5kID0gcmVxdWlyZSgneHRlbmQvbXV0YWJsZScpXG52YXIgaW5oZXJpdHMgPSByZXF1aXJlKCdpbmhlcml0cycpXG52YXIgcmVlbWl0ID0gcmVxdWlyZSgncmUtZW1pdHRlcicpXG52YXIgVHJhY2tlciA9IHJlcXVpcmUoJ2JpdHRvcnJlbnQtdHJhY2tlci9jbGllbnQnKSAvLyBgd2VidG9ycmVudC10cmFja2VyYCBpbiBicm93c2VyXG5cbmluaGVyaXRzKERpc2NvdmVyeSwgRXZlbnRFbWl0dGVyKVxuXG5mdW5jdGlvbiBEaXNjb3ZlcnkgKG9wdHMpIHtcbiAgdmFyIHNlbGYgPSB0aGlzXG4gIGlmICghKHNlbGYgaW5zdGFuY2VvZiBEaXNjb3ZlcnkpKSByZXR1cm4gbmV3IERpc2NvdmVyeShvcHRzKVxuICBFdmVudEVtaXR0ZXIuY2FsbChzZWxmKVxuXG4gIGV4dGVuZChzZWxmLCB7XG4gICAgYW5ub3VuY2U6IFtdLFxuICAgIGRodDogdHlwZW9mIERIVCA9PT0gJ2Z1bmN0aW9uJyxcbiAgICBydGNDb25maWc6IG51bGwsIC8vIGJyb3dzZXIgb25seVxuICAgIHBlZXJJZDogbnVsbCxcbiAgICBwb3J0OiAwLCAvLyB0b3JyZW50IHBvcnRcbiAgICB0cmFja2VyOiB0cnVlXG4gIH0sIG9wdHMpXG5cbiAgc2VsZi5fZXh0ZXJuYWxESFQgPSB0eXBlb2Ygc2VsZi5kaHQgPT09ICdvYmplY3QnXG4gIHNlbGYuX3BlcmZvcm1lZERIVExvb2t1cCA9IGZhbHNlXG5cbiAgaWYgKCFzZWxmLnBlZXJJZCkgdGhyb3cgbmV3IEVycm9yKCdwZWVySWQgcmVxdWlyZWQnKVxuICBpZiAoIXByb2Nlc3MuYnJvd3NlciAmJiAhc2VsZi5wb3J0KSB0aHJvdyBuZXcgRXJyb3IoJ3BvcnQgcmVxdWlyZWQnKVxuICBpZiAocHJvY2Vzcy5icm93c2VyICYmICghc2VsZi5hbm5vdW5jZSB8fCBzZWxmLmFubm91bmNlLmxlbmd0aCA9PT0gMCkpXG4gICAgY29uc29sZS53YXJuKCdXYXJuaW5nOiBtdXN0IHNwZWNpZnkgYSB0cmFja2VyIHNlcnZlciB0byBkaXNjb3ZlciBwZWVycyAocmVxdWlyZWQgaW4gYnJvd3NlciBiZWNhdXNlIERIVCBpcyBub3QgaW1wbGVtZW50ZWQgeWV0KSAoeW91IGNhbiB1c2Ugd3NzOi8vdHJhY2tlci53ZWJ0b3JyZW50LmlvKScpXG5cbiAgaWYgKHNlbGYuZGh0KSBzZWxmLl9jcmVhdGVESFQoc2VsZi5kaHRQb3J0KVxufVxuXG5EaXNjb3ZlcnkucHJvdG90eXBlLnNldFRvcnJlbnQgPSBmdW5jdGlvbiAodG9ycmVudCkge1xuICB2YXIgc2VsZiA9IHRoaXNcbiAgaWYgKHNlbGYudG9ycmVudCkgcmV0dXJuXG5cbiAgaWYgKHRvcnJlbnQgJiYgdG9ycmVudC5pbmZvSGFzaCkge1xuICAgIHNlbGYudG9ycmVudCA9IHRvcnJlbnRcbiAgICBzZWxmLmluZm9IYXNoID0gdG9ycmVudC5pbmZvSGFzaFxuICB9IGVsc2Uge1xuICAgIGlmIChzZWxmLmluZm9IYXNoKSByZXR1cm5cbiAgICBzZWxmLmluZm9IYXNoID0gdG9ycmVudFxuICB9XG4gIGRlYnVnKCdzZXRUb3JyZW50ICVzJywgdG9ycmVudClcblxuICAvLyBJZiB0cmFja2VyIGV4aXN0cywgdGhlbiBpdCB3YXMgY3JlYXRlZCB3aXRoIGp1c3QgaW5mb0hhc2guIFNldCB0b3JyZW50IGxlbmd0aFxuICAvLyBzbyBjbGllbnQgY2FuIHJlcG9ydCBjb3JyZWN0IGluZm9ybWF0aW9uIGFib3V0IHVwbG9hZHMuXG4gIGlmIChzZWxmLnRyYWNrZXIgJiYgc2VsZi50cmFja2VyICE9PSB0cnVlKVxuICAgIHNlbGYudHJhY2tlci50b3JyZW50TGVuZ3RoID0gdG9ycmVudC5sZW5ndGhcbiAgZWxzZVxuICAgIHNlbGYuX2NyZWF0ZVRyYWNrZXIoKVxuXG4gIGlmIChzZWxmLmRodCkge1xuICAgIGlmIChzZWxmLmRodC5yZWFkeSkgc2VsZi5fZGh0TG9va3VwQW5kQW5ub3VuY2UoKVxuICAgIGVsc2Ugc2VsZi5kaHQub24oJ3JlYWR5Jywgc2VsZi5fZGh0TG9va3VwQW5kQW5ub3VuY2UuYmluZChzZWxmKSlcbiAgfVxufVxuXG5EaXNjb3ZlcnkucHJvdG90eXBlLnN0b3AgPSBmdW5jdGlvbiAoY2IpIHtcbiAgdmFyIHNlbGYgPSB0aGlzXG4gIGlmIChzZWxmLnRyYWNrZXIgJiYgc2VsZi50cmFja2VyLnN0b3ApIHNlbGYudHJhY2tlci5zdG9wKClcbiAgaWYgKCFzZWxmLl9leHRlcm5hbERIVCAmJiBzZWxmLmRodCAmJiBzZWxmLmRodC5kZXN0cm95KSBzZWxmLmRodC5kZXN0cm95KGNiKVxuICBlbHNlIHByb2Nlc3MubmV4dFRpY2soZnVuY3Rpb24gKCkgeyBjYihudWxsKSB9KVxufVxuXG5EaXNjb3ZlcnkucHJvdG90eXBlLl9jcmVhdGVESFQgPSBmdW5jdGlvbiAocG9ydCkge1xuICB2YXIgc2VsZiA9IHRoaXNcbiAgaWYgKCFzZWxmLl9leHRlcm5hbERIVCkgc2VsZi5kaHQgPSBuZXcgREhUKClcbiAgcmVlbWl0KHNlbGYuZGh0LCBzZWxmLCBbJ2Vycm9yJywgJ3dhcm5pbmcnXSlcbiAgc2VsZi5kaHQub24oJ3BlZXInLCBmdW5jdGlvbiAoYWRkciwgaW5mb0hhc2gpIHtcbiAgICBpZiAoaW5mb0hhc2ggPT09IHNlbGYuaW5mb0hhc2gpIHNlbGYuZW1pdCgncGVlcicsIGFkZHIpXG4gIH0pXG4gIGlmICghc2VsZi5fZXh0ZXJuYWxESFQpIHNlbGYuZGh0Lmxpc3Rlbihwb3J0KVxufVxuXG5EaXNjb3ZlcnkucHJvdG90eXBlLl9jcmVhdGVUcmFja2VyID0gZnVuY3Rpb24gKCkge1xuICB2YXIgc2VsZiA9IHRoaXNcbiAgaWYgKCFzZWxmLnRyYWNrZXIpIHJldHVyblxuXG4gIHZhciB0b3JyZW50ID0gc2VsZi50b3JyZW50IHx8IHtcbiAgICBpbmZvSGFzaDogc2VsZi5pbmZvSGFzaCxcbiAgICBhbm5vdW5jZTogc2VsZi5hbm5vdW5jZVxuICB9XG5cbiAgc2VsZi50cmFja2VyID0gcHJvY2Vzcy5icm93c2VyXG4gICAgPyBuZXcgVHJhY2tlcihzZWxmLnBlZXJJZCwgdG9ycmVudCwgeyBydGNDb25maWc6IHNlbGYucnRjQ29uZmlnIH0pXG4gICAgOiBuZXcgVHJhY2tlcihzZWxmLnBlZXJJZCwgc2VsZi5wb3J0LCB0b3JyZW50KVxuXG4gIHJlZW1pdChzZWxmLnRyYWNrZXIsIHNlbGYsIFsncGVlcicsICd3YXJuaW5nJywgJ2Vycm9yJ10pXG4gIHNlbGYudHJhY2tlci5zdGFydCgpXG59XG5cbkRpc2NvdmVyeS5wcm90b3R5cGUuX2RodExvb2t1cEFuZEFubm91bmNlID0gZnVuY3Rpb24gKCkge1xuICB2YXIgc2VsZiA9IHRoaXNcbiAgaWYgKHNlbGYuX3BlcmZvcm1lZERIVExvb2t1cCkgcmV0dXJuXG4gIHNlbGYuX3BlcmZvcm1lZERIVExvb2t1cCA9IHRydWVcblxuICBkZWJ1ZygnZGh0IGxvb2t1cCcpXG4gIHNlbGYuZGh0Lmxvb2t1cChzZWxmLmluZm9IYXNoLCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgaWYgKGVyciB8fCAhc2VsZi5wb3J0KSByZXR1cm5cbiAgICBkZWJ1ZygnZGh0IGFubm91bmNlJylcbiAgICBzZWxmLmRodC5hbm5vdW5jZShzZWxmLmluZm9IYXNoLCBzZWxmLnBvcnQsIGZ1bmN0aW9uICgpIHtcbiAgICAgIGRlYnVnKCdkaHQgYW5ub3VuY2UgY29tcGxldGUnKVxuICAgICAgc2VsZi5lbWl0KCdkaHRBbm5vdW5jZScpXG4gICAgfSlcbiAgfSlcbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gQ2xpZW50XG5cbnZhciBkZWJ1ZyA9IHJlcXVpcmUoJ2RlYnVnJykoJ3dlYnRvcnJlbnQtdHJhY2tlcicpXG52YXIgRXZlbnRFbWl0dGVyID0gcmVxdWlyZSgnZXZlbnRzJykuRXZlbnRFbWl0dGVyXG52YXIgZXh0ZW5kID0gcmVxdWlyZSgnZXh0ZW5kLmpzJylcbnZhciBoYXQgPSByZXF1aXJlKCdoYXQnKVxudmFyIGluaGVyaXRzID0gcmVxdWlyZSgnaW5oZXJpdHMnKVxudmFyIFBlZXIgPSByZXF1aXJlKCdzaW1wbGUtcGVlcicpXG52YXIgU29ja2V0ID0gcmVxdWlyZSgnc2ltcGxlLXdlYnNvY2tldCcpXG5cbnZhciBERUZBVUxUX05VTV9XQU5UID0gMTVcblxuaW5oZXJpdHMoQ2xpZW50LCBFdmVudEVtaXR0ZXIpXG5cbi8vIEl0IHR1cm5zIG91dCB0aGF0IHlvdSBjYW4ndCBvcGVuIG11bHRpcGxlIHdlYnNvY2tldHMgdG8gdGhlIHNhbWUgc2VydmVyIHdpdGhpbiBvbmVcbi8vIGJyb3dzZXIgdGFiLCBzbyBsZXQncyByZXVzZSB0aGVtLlxudmFyIHNvY2tldHMgPSB7fVxuXG4vKipcbiAqIEEgQ2xpZW50IG1hbmFnZXMgdHJhY2tlciBjb25uZWN0aW9ucyBmb3IgYSB0b3JyZW50LlxuICpcbiAqIEBwYXJhbSB7c3RyaW5nfSBwZWVySWQgIHRoaXMgcGVlcidzIGlkXG4gKiBAcGFyYW0ge09iamVjdH0gdG9ycmVudCBwYXJzZWQgdG9ycmVudFxuICogQHBhcmFtIHtPYmplY3R9IG9wdHMgICAgb3B0aW9uYWwgb3B0aW9uc1xuICogQHBhcmFtIHtOdW1iZXJ9IG9wdHMubnVtV2FudCAgICBudW1iZXIgb2YgcGVlcnMgdG8gcmVxdWVzdFxuICogQHBhcmFtIHtOdW1iZXJ9IG9wdHMuaW50ZXJ2YWwgICBpbnRlcnZhbCBpbiBtcyB0byBzZW5kIGFubm91bmNlIHJlcXVlc3RzIHRvIHRoZSB0cmFja2VyXG4gKiBAcGFyYW0ge051bWJlcn0gb3B0cy5ydGNDb25maWcgIFJUQ1BlZXJDb25uZWN0aW9uIGNvbmZpZ3VyYXRpb24gb2JqZWN0XG4gKi9cbmZ1bmN0aW9uIENsaWVudCAocGVlcklkLCB0b3JyZW50LCBvcHRzKSB7XG4gIHZhciBzZWxmID0gdGhpc1xuICBpZiAoIShzZWxmIGluc3RhbmNlb2YgQ2xpZW50KSkgcmV0dXJuIG5ldyBDbGllbnQocGVlcklkLCB0b3JyZW50LCBvcHRzKVxuICBFdmVudEVtaXR0ZXIuY2FsbChzZWxmKVxuICBzZWxmLl9vcHRzID0gb3B0cyB8fCB7fVxuXG4gIC8vIHJlcXVpcmVkXG4gIHNlbGYuX3BlZXJJZCA9IEJ1ZmZlci5pc0J1ZmZlcihwZWVySWQpXG4gICAgPyBwZWVySWRcbiAgICA6IG5ldyBCdWZmZXIocGVlcklkLCAnaGV4JylcbiAgc2VsZi5faW5mb0hhc2ggPSBCdWZmZXIuaXNCdWZmZXIodG9ycmVudC5pbmZvSGFzaClcbiAgICA/IHRvcnJlbnQuaW5mb0hhc2hcbiAgICA6IG5ldyBCdWZmZXIodG9ycmVudC5pbmZvSGFzaCwgJ2hleCcpXG4gIHNlbGYudG9ycmVudExlbmd0aCA9IHRvcnJlbnQubGVuZ3RoXG5cbiAgLy8gb3B0aW9uYWxcbiAgc2VsZi5fbnVtV2FudCA9IHNlbGYuX29wdHMubnVtV2FudCB8fCBERUZBVUxUX05VTV9XQU5UXG4gIHNlbGYuX2ludGVydmFsTXMgPSBzZWxmLl9vcHRzLmludGVydmFsIHx8ICgzMCAqIDYwICogMTAwMCkgLy8gZGVmYXVsdDogMzAgbWludXRlc1xuXG4gIGRlYnVnKCduZXcgY2xpZW50ICVzJywgc2VsZi5faW5mb0hhc2gudG9TdHJpbmcoJ2hleCcpKVxuXG4gIGlmICh0eXBlb2YgdG9ycmVudC5hbm5vdW5jZSA9PT0gJ3N0cmluZycpIHRvcnJlbnQuYW5ub3VuY2UgPSBbIHRvcnJlbnQuYW5ub3VuY2UgXVxuICBzZWxmLl90cmFja2VycyA9ICh0b3JyZW50LmFubm91bmNlIHx8IFtdKVxuICAgIC5maWx0ZXIoZnVuY3Rpb24gKGFubm91bmNlVXJsKSB7XG4gICAgICByZXR1cm4gYW5ub3VuY2VVcmwuaW5kZXhPZignd3M6Ly8nKSA9PT0gMCB8fCBhbm5vdW5jZVVybC5pbmRleE9mKCd3c3M6Ly8nKSA9PT0gMFxuICAgIH0pXG4gICAgLm1hcChmdW5jdGlvbiAoYW5ub3VuY2VVcmwpIHtcbiAgICAgIHJldHVybiBuZXcgVHJhY2tlcihzZWxmLCBhbm5vdW5jZVVybCwgc2VsZi5fb3B0cylcbiAgICB9KVxufVxuXG5DbGllbnQucHJvdG90eXBlLnN0YXJ0ID0gZnVuY3Rpb24gKG9wdHMpIHtcbiAgdmFyIHNlbGYgPSB0aGlzXG4gIHNlbGYuX3RyYWNrZXJzLmZvckVhY2goZnVuY3Rpb24gKHRyYWNrZXIpIHtcbiAgICB0cmFja2VyLnN0YXJ0KG9wdHMpXG4gIH0pXG59XG5cbkNsaWVudC5wcm90b3R5cGUuc3RvcCA9IGZ1bmN0aW9uIChvcHRzKSB7XG4gIHZhciBzZWxmID0gdGhpc1xuICBzZWxmLl90cmFja2Vycy5mb3JFYWNoKGZ1bmN0aW9uICh0cmFja2VyKSB7XG4gICAgdHJhY2tlci5zdG9wKG9wdHMpXG4gIH0pXG59XG5cbkNsaWVudC5wcm90b3R5cGUuY29tcGxldGUgPSBmdW5jdGlvbiAob3B0cykge1xuICB2YXIgc2VsZiA9IHRoaXNcbiAgc2VsZi5fdHJhY2tlcnMuZm9yRWFjaChmdW5jdGlvbiAodHJhY2tlcikge1xuICAgIHRyYWNrZXIuY29tcGxldGUob3B0cylcbiAgfSlcbn1cblxuQ2xpZW50LnByb3RvdHlwZS51cGRhdGUgPSBmdW5jdGlvbiAob3B0cykge1xuICB2YXIgc2VsZiA9IHRoaXNcbiAgc2VsZi5fdHJhY2tlcnMuZm9yRWFjaChmdW5jdGlvbiAodHJhY2tlcikge1xuICAgIHRyYWNrZXIudXBkYXRlKG9wdHMpXG4gIH0pXG59XG5cbkNsaWVudC5wcm90b3R5cGUuc2V0SW50ZXJ2YWwgPSBmdW5jdGlvbiAoaW50ZXJ2YWxNcykge1xuICB2YXIgc2VsZiA9IHRoaXNcbiAgc2VsZi5faW50ZXJ2YWxNcyA9IGludGVydmFsTXNcblxuICBzZWxmLl90cmFja2Vycy5mb3JFYWNoKGZ1bmN0aW9uICh0cmFja2VyKSB7XG4gICAgdHJhY2tlci5zZXRJbnRlcnZhbChpbnRlcnZhbE1zKVxuICB9KVxufVxuXG5pbmhlcml0cyhUcmFja2VyLCBFdmVudEVtaXR0ZXIpXG5cbi8qKlxuICogQW4gaW5kaXZpZHVhbCB0b3JyZW50IHRyYWNrZXIgKHVzZWQgYnkgQ2xpZW50KVxuICpcbiAqIEBwYXJhbSB7Q2xpZW50fSBjbGllbnQgICAgICAgcGFyZW50IGJpdHRvcnJlbnQgdHJhY2tlciBjbGllbnRcbiAqIEBwYXJhbSB7c3RyaW5nfSBhbm5vdW5jZVVybCAgYW5ub3VuY2UgdXJsIG9mIHRyYWNrZXJcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRzICAgICAgICAgb3B0aW9uYWwgb3B0aW9uc1xuICovXG5mdW5jdGlvbiBUcmFja2VyIChjbGllbnQsIGFubm91bmNlVXJsLCBvcHRzKSB7XG4gIHZhciBzZWxmID0gdGhpc1xuICBFdmVudEVtaXR0ZXIuY2FsbChzZWxmKVxuICBzZWxmLl9vcHRzID0gb3B0cyB8fCB7fVxuICBzZWxmLl9hbm5vdW5jZVVybCA9IGFubm91bmNlVXJsXG4gIHNlbGYuX3BlZXJzID0ge30gLy8gcGVlcnMgKG9mZmVyIGlkIC0+IHBlZXIpXG5cbiAgZGVidWcoJ25ldyB0cmFja2VyICVzJywgYW5ub3VuY2VVcmwpXG5cbiAgc2VsZi5jbGllbnQgPSBjbGllbnRcbiAgc2VsZi5yZWFkeSA9IGZhbHNlXG5cbiAgc2VsZi5fc29ja2V0ID0gbnVsbFxuICBzZWxmLl9pbnRlcnZhbE1zID0gc2VsZi5jbGllbnQuX2ludGVydmFsTXMgLy8gdXNlIGNsaWVudCBpbnRlcnZhbCBpbml0aWFsbHlcbiAgc2VsZi5faW50ZXJ2YWwgPSBudWxsXG59XG5cblRyYWNrZXIucHJvdG90eXBlLnN0YXJ0ID0gZnVuY3Rpb24gKG9wdHMpIHtcbiAgdmFyIHNlbGYgPSB0aGlzXG4gIG9wdHMgPSBvcHRzIHx8IHt9XG4gIG9wdHMuZXZlbnQgPSAnc3RhcnRlZCdcblxuICBkZWJ1Zygnc2VudCBgc3RhcnRgICVzICVzJywgc2VsZi5fYW5ub3VuY2VVcmwsIEpTT04uc3RyaW5naWZ5KG9wdHMpKVxuICBzZWxmLl9hbm5vdW5jZShvcHRzKVxuICBzZWxmLnNldEludGVydmFsKHNlbGYuX2ludGVydmFsTXMpIC8vIHN0YXJ0IGFubm91bmNpbmcgb24gaW50ZXJ2YWxzXG59XG5cblRyYWNrZXIucHJvdG90eXBlLnN0b3AgPSBmdW5jdGlvbiAob3B0cykge1xuICB2YXIgc2VsZiA9IHRoaXNcbiAgb3B0cyA9IG9wdHMgfHwge31cbiAgb3B0cy5ldmVudCA9ICdzdG9wcGVkJ1xuXG4gIGRlYnVnKCdzZW50IGBzdG9wYCAlcyAlcycsIHNlbGYuX2Fubm91bmNlVXJsLCBKU09OLnN0cmluZ2lmeShvcHRzKSlcbiAgc2VsZi5fYW5ub3VuY2Uob3B0cylcbiAgc2VsZi5zZXRJbnRlcnZhbCgwKSAvLyBzdG9wIGFubm91bmNpbmcgb24gaW50ZXJ2YWxzXG5cbiAgLy8gVE9ETzogZGVzdHJveSB0aGUgd2Vic29ja2V0XG59XG5cblRyYWNrZXIucHJvdG90eXBlLmNvbXBsZXRlID0gZnVuY3Rpb24gKG9wdHMpIHtcbiAgdmFyIHNlbGYgPSB0aGlzXG4gIG9wdHMgPSBvcHRzIHx8IHt9XG4gIG9wdHMuZXZlbnQgPSAnY29tcGxldGVkJ1xuICBvcHRzLmRvd25sb2FkZWQgPSBvcHRzLmRvd25sb2FkZWQgfHwgc2VsZi50b3JyZW50TGVuZ3RoIHx8IDBcblxuICBkZWJ1Zygnc2VudCBgY29tcGxldGVgICVzICVzJywgc2VsZi5fYW5ub3VuY2VVcmwsIEpTT04uc3RyaW5naWZ5KG9wdHMpKVxuICBzZWxmLl9hbm5vdW5jZShvcHRzKVxufVxuXG5UcmFja2VyLnByb3RvdHlwZS51cGRhdGUgPSBmdW5jdGlvbiAob3B0cykge1xuICB2YXIgc2VsZiA9IHRoaXNcbiAgb3B0cyA9IG9wdHMgfHwge31cblxuICBkZWJ1Zygnc2VudCBgdXBkYXRlYCAlcyAlcycsIHNlbGYuX2Fubm91bmNlVXJsLCBKU09OLnN0cmluZ2lmeShvcHRzKSlcbiAgc2VsZi5fYW5ub3VuY2Uob3B0cylcbn1cblxuVHJhY2tlci5wcm90b3R5cGUuX2luaXQgPSBmdW5jdGlvbiAob25yZWFkeSkge1xuICB2YXIgc2VsZiA9IHRoaXNcbiAgaWYgKG9ucmVhZHkpIHNlbGYub25jZSgncmVhZHknLCBvbnJlYWR5KVxuICBpZiAoc2VsZi5fc29ja2V0KSByZXR1cm5cblxuICBpZiAoc29ja2V0c1tzZWxmLl9hbm5vdW5jZVVybF0pIHtcbiAgICBzZWxmLl9zb2NrZXQgPSBzb2NrZXRzW3NlbGYuX2Fubm91bmNlVXJsXVxuICAgIHNlbGYuX29uU29ja2V0UmVhZHkoKVxuICB9IGVsc2Uge1xuICAgIHNlbGYuX3NvY2tldCA9IHNvY2tldHNbc2VsZi5fYW5ub3VuY2VVcmxdID0gbmV3IFNvY2tldChzZWxmLl9hbm5vdW5jZVVybClcbiAgICBzZWxmLl9zb2NrZXQub24oJ3JlYWR5Jywgc2VsZi5fb25Tb2NrZXRSZWFkeS5iaW5kKHNlbGYpKVxuICB9XG4gIHNlbGYuX3NvY2tldC5vbignd2FybmluZycsIHNlbGYuX29uU29ja2V0V2FybmluZy5iaW5kKHNlbGYpKVxuICBzZWxmLl9zb2NrZXQub24oJ2Vycm9yJywgc2VsZi5fb25Tb2NrZXRXYXJuaW5nLmJpbmQoc2VsZikpXG4gIHNlbGYuX3NvY2tldC5vbignbWVzc2FnZScsIHNlbGYuX29uU29ja2V0TWVzc2FnZS5iaW5kKHNlbGYpKVxufVxuXG5UcmFja2VyLnByb3RvdHlwZS5fb25Tb2NrZXRSZWFkeSA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIHNlbGYgPSB0aGlzXG4gIHNlbGYucmVhZHkgPSB0cnVlXG4gIHNlbGYuZW1pdCgncmVhZHknKVxufVxuXG5UcmFja2VyLnByb3RvdHlwZS5fb25Tb2NrZXRXYXJuaW5nID0gZnVuY3Rpb24gKGVycikge1xuICBkZWJ1ZygndHJhY2tlciB3YXJuaW5nICVzJywgZXJyLm1lc3NhZ2UpXG59XG5cblRyYWNrZXIucHJvdG90eXBlLl9vblNvY2tldE1lc3NhZ2UgPSBmdW5jdGlvbiAoZGF0YSkge1xuICB2YXIgc2VsZiA9IHRoaXNcblxuICBpZiAoISh0eXBlb2YgZGF0YSA9PT0gJ29iamVjdCcgJiYgZGF0YSAhPT0gbnVsbCkpXG4gICAgcmV0dXJuIHNlbGYuY2xpZW50LmVtaXQoJ3dhcm5pbmcnLCBuZXcgRXJyb3IoJ0ludmFsaWQgdHJhY2tlciByZXNwb25zZScpKVxuXG4gIGlmIChkYXRhLmluZm9faGFzaCAhPT0gc2VsZi5jbGllbnQuX2luZm9IYXNoLnRvU3RyaW5nKCdiaW5hcnknKSlcbiAgICByZXR1cm5cblxuICBkZWJ1ZygncmVjZWl2ZWQgJXMgZnJvbSAlcycsIEpTT04uc3RyaW5naWZ5KGRhdGEpLCBzZWxmLl9hbm5vdW5jZVVybClcblxuICB2YXIgZmFpbHVyZSA9IGRhdGFbJ2ZhaWx1cmUgcmVhc29uJ11cbiAgaWYgKGZhaWx1cmUpXG4gICAgcmV0dXJuIHNlbGYuY2xpZW50LmVtaXQoJ3dhcm5pbmcnLCBuZXcgRXJyb3IoZmFpbHVyZSkpXG5cbiAgdmFyIHdhcm5pbmcgPSBkYXRhWyd3YXJuaW5nIG1lc3NhZ2UnXVxuICBpZiAod2FybmluZylcbiAgICBzZWxmLmNsaWVudC5lbWl0KCd3YXJuaW5nJywgbmV3IEVycm9yKHdhcm5pbmcpKVxuXG4gIHZhciBpbnRlcnZhbCA9IGRhdGEuaW50ZXJ2YWwgfHwgZGF0YVsnbWluIGludGVydmFsJ11cbiAgaWYgKGludGVydmFsICYmICFzZWxmLl9vcHRzLmludGVydmFsICYmIHNlbGYuX2ludGVydmFsTXMgIT09IDApIHtcbiAgICAvLyB1c2UgdGhlIGludGVydmFsIHRoZSB0cmFja2VyIHJlY29tbWVuZHMsIFVOTEVTUyB0aGUgdXNlciBtYW51YWxseSBzcGVjaWZpZXMgYW5cbiAgICAvLyBpbnRlcnZhbCB0aGV5IHdhbnQgdG8gdXNlXG4gICAgc2VsZi5zZXRJbnRlcnZhbChpbnRlcnZhbCAqIDEwMDApXG4gIH1cblxuICB2YXIgdHJhY2tlcklkID0gZGF0YVsndHJhY2tlciBpZCddXG4gIGlmICh0cmFja2VySWQpIHtcbiAgICAvLyBJZiBhYnNlbnQsIGRvIG5vdCBkaXNjYXJkIHByZXZpb3VzIHRyYWNrZXJJZCB2YWx1ZVxuICAgIHNlbGYuX3RyYWNrZXJJZCA9IHRyYWNrZXJJZFxuICB9XG5cbiAgaWYgKGRhdGEuY29tcGxldGUpIHtcbiAgICBzZWxmLmNsaWVudC5lbWl0KCd1cGRhdGUnLCB7XG4gICAgICBhbm5vdW5jZTogc2VsZi5fYW5ub3VuY2VVcmwsXG4gICAgICBjb21wbGV0ZTogZGF0YS5jb21wbGV0ZSxcbiAgICAgIGluY29tcGxldGU6IGRhdGEuaW5jb21wbGV0ZVxuICAgIH0pXG4gIH1cblxuICB2YXIgcGVlclxuICBpZiAoZGF0YS5vZmZlcikge1xuICAgIHBlZXIgPSBuZXcgUGVlcih7IHRyaWNrbGU6IGZhbHNlLCBjb25maWc6IHNlbGYuX29wdHMucnRjQ29uZmlnIH0pXG4gICAgcGVlci5pZCA9IGJpbmFyeVRvSGV4KGRhdGEucGVlcl9pZClcbiAgICBwZWVyLm9uY2UoJ3NpZ25hbCcsIGZ1bmN0aW9uIChhbnN3ZXIpIHtcbiAgICAgIHZhciBvcHRzID0ge1xuICAgICAgICBpbmZvX2hhc2g6IHNlbGYuY2xpZW50Ll9pbmZvSGFzaC50b1N0cmluZygnYmluYXJ5JyksXG4gICAgICAgIHBlZXJfaWQ6IHNlbGYuY2xpZW50Ll9wZWVySWQudG9TdHJpbmcoJ2JpbmFyeScpLFxuICAgICAgICB0b19wZWVyX2lkOiBkYXRhLnBlZXJfaWQsXG4gICAgICAgIGFuc3dlcjogYW5zd2VyLFxuICAgICAgICBvZmZlcl9pZDogZGF0YS5vZmZlcl9pZFxuICAgICAgfVxuICAgICAgaWYgKHNlbGYuX3RyYWNrZXJJZCkgb3B0cy50cmFja2VyaWQgPSBzZWxmLl90cmFja2VySWRcbiAgICAgIHNlbGYuX3NlbmQob3B0cylcbiAgICB9KVxuICAgIHBlZXIuc2lnbmFsKGRhdGEub2ZmZXIpXG4gICAgc2VsZi5jbGllbnQuZW1pdCgncGVlcicsIHBlZXIpXG4gIH1cblxuICBpZiAoZGF0YS5hbnN3ZXIpIHtcbiAgICBwZWVyID0gc2VsZi5fcGVlcnNbZGF0YS5vZmZlcl9pZF1cbiAgICBpZiAocGVlcikge1xuICAgICAgcGVlci5pZCA9IGJpbmFyeVRvSGV4KGRhdGEucGVlcl9pZClcbiAgICAgIHBlZXIuc2lnbmFsKGRhdGEuYW5zd2VyKVxuICAgICAgc2VsZi5jbGllbnQuZW1pdCgncGVlcicsIHBlZXIpXG4gICAgfSBlbHNlIHtcbiAgICAgIGRlYnVnKCdnb3QgdW5leHBlY3RlZCBhbnN3ZXI6ICcgKyBKU09OLnN0cmluZ2lmeShkYXRhLmFuc3dlcikpXG4gICAgfVxuICB9XG59XG5cbi8qKlxuICogU2VuZCBhbiBhbm5vdW5jZSByZXF1ZXN0IHRvIHRoZSB0cmFja2VyLlxuICogQHBhcmFtIHtPYmplY3R9IG9wdHNcbiAqIEBwYXJhbSB7bnVtYmVyPX0gb3B0cy51cGxvYWRlZFxuICogQHBhcmFtIHtudW1iZXI9fSBvcHRzLmRvd25sb2FkZWRcbiAqIEBwYXJhbSB7bnVtYmVyPX0gb3B0cy5sZWZ0IChpZiBub3Qgc2V0LCBjYWxjdWxhdGVkIGF1dG9tYXRpY2FsbHkpXG4gKi9cblRyYWNrZXIucHJvdG90eXBlLl9hbm5vdW5jZSA9IGZ1bmN0aW9uIChvcHRzKSB7XG4gIHZhciBzZWxmID0gdGhpc1xuICBpZiAoIXNlbGYucmVhZHkpIHJldHVybiBzZWxmLl9pbml0KHNlbGYuX2Fubm91bmNlLmJpbmQoc2VsZiwgb3B0cykpXG5cbiAgc2VsZi5fZ2VuZXJhdGVPZmZlcnMoZnVuY3Rpb24gKG9mZmVycykge1xuICAgIG9wdHMgPSBleHRlbmQoe1xuICAgICAgdXBsb2FkZWQ6IDAsIC8vIGRlZmF1bHQsIHVzZXIgc2hvdWxkIHByb3ZpZGUgcmVhbCB2YWx1ZVxuICAgICAgZG93bmxvYWRlZDogMCwgLy8gZGVmYXVsdCwgdXNlciBzaG91bGQgcHJvdmlkZSByZWFsIHZhbHVlXG4gICAgICBpbmZvX2hhc2g6IHNlbGYuY2xpZW50Ll9pbmZvSGFzaC50b1N0cmluZygnYmluYXJ5JyksXG4gICAgICBwZWVyX2lkOiBzZWxmLmNsaWVudC5fcGVlcklkLnRvU3RyaW5nKCdiaW5hcnknKSxcbiAgICAgIG9mZmVyczogb2ZmZXJzXG4gICAgfSwgb3B0cylcblxuICAgIGlmIChzZWxmLmNsaWVudC50b3JyZW50TGVuZ3RoICE9IG51bGwgJiYgb3B0cy5sZWZ0ID09IG51bGwpIHtcbiAgICAgIG9wdHMubGVmdCA9IHNlbGYuY2xpZW50LnRvcnJlbnRMZW5ndGggLSAob3B0cy5kb3dubG9hZGVkIHx8IDApXG4gICAgfVxuXG4gICAgaWYgKHNlbGYuX3RyYWNrZXJJZCkge1xuICAgICAgb3B0cy50cmFja2VyaWQgPSBzZWxmLl90cmFja2VySWRcbiAgICB9XG4gICAgc2VsZi5fc2VuZChvcHRzKVxuICB9KVxufVxuXG5UcmFja2VyLnByb3RvdHlwZS5fc2VuZCA9IGZ1bmN0aW9uIChvcHRzKSB7XG4gIHZhciBzZWxmID0gdGhpc1xuICBkZWJ1Zygnc2VuZCAlcycsIEpTT04uc3RyaW5naWZ5KG9wdHMpKVxuICBzZWxmLl9zb2NrZXQuc2VuZChvcHRzKVxufVxuXG5UcmFja2VyLnByb3RvdHlwZS5fZ2VuZXJhdGVPZmZlcnMgPSBmdW5jdGlvbiAoY2IpIHtcbiAgdmFyIHNlbGYgPSB0aGlzXG4gIHZhciBvZmZlcnMgPSBbXVxuICBkZWJ1ZygnZ2VuZXJhdGluZyAlcyBvZmZlcnMnLCBzZWxmLmNsaWVudC5fbnVtV2FudClcblxuICAvLyBUT0RPOiBjbGVhbnVwIGRlYWQgcGVlcnMgYW5kIHBlZXJzIHRoYXQgbmV2ZXIgZ2V0IGEgcmV0dXJuIG9mZmVyLCBmcm9tIHNlbGYuX3BlZXJzXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgc2VsZi5jbGllbnQuX251bVdhbnQ7ICsraSkge1xuICAgIGdlbmVyYXRlT2ZmZXIoKVxuICB9XG5cbiAgZnVuY3Rpb24gZ2VuZXJhdGVPZmZlciAoKSB7XG4gICAgdmFyIG9mZmVySWQgPSBoYXQoMTYwKVxuICAgIHZhciBwZWVyID0gc2VsZi5fcGVlcnNbb2ZmZXJJZF0gPSBuZXcgUGVlcih7XG4gICAgICBpbml0aWF0b3I6IHRydWUsXG4gICAgICB0cmlja2xlOiBmYWxzZSxcbiAgICAgIGNvbmZpZzogc2VsZi5fb3B0cy5ydGNDb25maWdcbiAgICB9KVxuICAgIHBlZXIub25jZSgnc2lnbmFsJywgZnVuY3Rpb24gKG9mZmVyKSB7XG4gICAgICBvZmZlcnMucHVzaCh7XG4gICAgICAgIG9mZmVyOiBvZmZlcixcbiAgICAgICAgb2ZmZXJfaWQ6IG9mZmVySWRcbiAgICAgIH0pXG4gICAgICBjaGVja0RvbmUoKVxuICAgIH0pXG4gIH1cblxuICBmdW5jdGlvbiBjaGVja0RvbmUgKCkge1xuICAgIGlmIChvZmZlcnMubGVuZ3RoID09PSBzZWxmLmNsaWVudC5fbnVtV2FudCkge1xuICAgICAgZGVidWcoJ2dlbmVyYXRlZCAlcyBvZmZlcnMnLCBzZWxmLmNsaWVudC5fbnVtV2FudClcbiAgICAgIGNiKG9mZmVycylcbiAgICB9XG4gIH1cbn1cblxuVHJhY2tlci5wcm90b3R5cGUuc2V0SW50ZXJ2YWwgPSBmdW5jdGlvbiAoaW50ZXJ2YWxNcykge1xuICB2YXIgc2VsZiA9IHRoaXNcbiAgY2xlYXJJbnRlcnZhbChzZWxmLl9pbnRlcnZhbClcblxuICBzZWxmLl9pbnRlcnZhbE1zID0gaW50ZXJ2YWxNc1xuICBpZiAoaW50ZXJ2YWxNcykge1xuICAgIHNlbGYuX2ludGVydmFsID0gc2V0SW50ZXJ2YWwoc2VsZi51cGRhdGUuYmluZChzZWxmKSwgc2VsZi5faW50ZXJ2YWxNcylcbiAgfVxufVxuXG5mdW5jdGlvbiBiaW5hcnlUb0hleCAoaWQpIHtcbiAgcmV0dXJuIG5ldyBCdWZmZXIoaWQsICdiaW5hcnknKS50b1N0cmluZygnaGV4Jylcbn1cbiIsIi8qKlxuICogRXh0ZW5kIGFuIG9iamVjdCB3aXRoIGFub3RoZXIuXG4gKlxuICogQHBhcmFtIHtPYmplY3QsIC4uLn0gc3JjLCAuLi5cbiAqIEByZXR1cm4ge09iamVjdH0gbWVyZ2VkXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHNyYykge1xuICB2YXIgb2JqcyA9IFtdLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKSwgb2JqO1xuXG4gIGZvciAodmFyIGkgPSAwLCBsZW4gPSBvYmpzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgb2JqID0gb2Jqc1tpXTtcbiAgICBmb3IgKHZhciBwcm9wIGluIG9iaikge1xuICAgICAgc3JjW3Byb3BdID0gb2JqW3Byb3BdO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBzcmM7XG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IFBlZXJcblxudmFyIGRlYnVnID0gcmVxdWlyZSgnZGVidWcnKSgnc2ltcGxlLXBlZXInKVxudmFyIEV2ZW50RW1pdHRlciA9IHJlcXVpcmUoJ2V2ZW50cycpLkV2ZW50RW1pdHRlclxudmFyIGV4dGVuZCA9IHJlcXVpcmUoJ2V4dGVuZC5qcycpXG52YXIgaGF0ID0gcmVxdWlyZSgnaGF0JylcbnZhciBpbmhlcml0cyA9IHJlcXVpcmUoJ2luaGVyaXRzJylcbnZhciBpc1R5cGVkQXJyYXkgPSByZXF1aXJlKCdpcy10eXBlZGFycmF5JylcbnZhciBvbmNlID0gcmVxdWlyZSgnb25jZScpXG52YXIgc3RyZWFtID0gcmVxdWlyZSgnc3RyZWFtJylcbnZhciB0b0J1ZmZlciA9IHJlcXVpcmUoJ3R5cGVkYXJyYXktdG8tYnVmZmVyJylcblxudmFyIFJUQ1BlZXJDb25uZWN0aW9uID0gdHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgJiZcbiAgICAod2luZG93Lm1velJUQ1BlZXJDb25uZWN0aW9uXG4gIHx8IHdpbmRvdy5SVENQZWVyQ29ubmVjdGlvblxuICB8fCB3aW5kb3cud2Via2l0UlRDUGVlckNvbm5lY3Rpb24pXG5cbnZhciBSVENTZXNzaW9uRGVzY3JpcHRpb24gPSB0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJyAmJlxuICAgICh3aW5kb3cubW96UlRDU2Vzc2lvbkRlc2NyaXB0aW9uXG4gIHx8IHdpbmRvdy5SVENTZXNzaW9uRGVzY3JpcHRpb25cbiAgfHwgd2luZG93LndlYmtpdFJUQ1Nlc3Npb25EZXNjcmlwdGlvbilcblxudmFyIFJUQ0ljZUNhbmRpZGF0ZSA9IHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnICYmXG4gICAgKHdpbmRvdy5tb3pSVENJY2VDYW5kaWRhdGVcbiAgfHwgd2luZG93LlJUQ0ljZUNhbmRpZGF0ZVxuICB8fCB3aW5kb3cud2Via2l0UlRDSWNlQ2FuZGlkYXRlKVxuXG5pbmhlcml0cyhQZWVyLCBFdmVudEVtaXR0ZXIpXG5cbi8qKlxuICogQSBXZWJSVEMgcGVlciBjb25uZWN0aW9uLlxuICogQHBhcmFtIHtPYmplY3R9IG9wdHNcbiAqL1xuZnVuY3Rpb24gUGVlciAob3B0cykge1xuICB2YXIgc2VsZiA9IHRoaXNcbiAgaWYgKCEoc2VsZiBpbnN0YW5jZW9mIFBlZXIpKSByZXR1cm4gbmV3IFBlZXIob3B0cylcbiAgRXZlbnRFbWl0dGVyLmNhbGwoc2VsZilcblxuICBvcHRzID0gZXh0ZW5kKHtcbiAgICBpbml0aWF0b3I6IGZhbHNlLFxuICAgIHN0cmVhbTogZmFsc2UsXG4gICAgY29uZmlnOiBQZWVyLmNvbmZpZyxcbiAgICBjb25zdHJhaW50czogUGVlci5jb25zdHJhaW50cyxcbiAgICBjaGFubmVsTmFtZTogKG9wdHMgJiYgb3B0cy5pbml0aWF0b3IpID8gaGF0KDE2MCkgOiBudWxsLFxuICAgIHRyaWNrbGU6IHRydWVcbiAgfSwgb3B0cylcblxuICBleHRlbmQoc2VsZiwgb3B0cylcblxuICBkZWJ1ZygnbmV3IHBlZXIgaW5pdGlhdG9yOiAlcyBjaGFubmVsTmFtZTogJXMnLCBzZWxmLmluaXRpYXRvciwgc2VsZi5jaGFubmVsTmFtZSlcblxuICBzZWxmLmRlc3Ryb3llZCA9IGZhbHNlXG4gIHNlbGYucmVhZHkgPSBmYWxzZVxuICBzZWxmLl9wY1JlYWR5ID0gZmFsc2VcbiAgc2VsZi5fY2hhbm5lbFJlYWR5ID0gZmFsc2VcbiAgc2VsZi5fZGF0YVN0cmVhbXMgPSBbXVxuICBzZWxmLl9pY2VDb21wbGV0ZSA9IGZhbHNlIC8vIGRvbmUgd2l0aCBpY2UgY2FuZGlkYXRlIHRyaWNrbGUgKGdvdCBudWxsIGNhbmRpZGF0ZSlcblxuICBzZWxmLl9wYyA9IG5ldyBSVENQZWVyQ29ubmVjdGlvbihzZWxmLmNvbmZpZywgc2VsZi5jb25zdHJhaW50cylcbiAgc2VsZi5fcGMub25pY2Vjb25uZWN0aW9uc3RhdGVjaGFuZ2UgPSBzZWxmLl9vbkljZUNvbm5lY3Rpb25TdGF0ZUNoYW5nZS5iaW5kKHNlbGYpXG4gIHNlbGYuX3BjLm9uc2lnbmFsaW5nc3RhdGVjaGFuZ2UgPSBzZWxmLl9vblNpZ25hbGluZ1N0YXRlQ2hhbmdlLmJpbmQoc2VsZilcbiAgc2VsZi5fcGMub25pY2VjYW5kaWRhdGUgPSBzZWxmLl9vbkljZUNhbmRpZGF0ZS5iaW5kKHNlbGYpXG5cbiAgc2VsZi5fY2hhbm5lbCA9IG51bGxcblxuICBpZiAoc2VsZi5zdHJlYW0pXG4gICAgc2VsZi5fc2V0dXBWaWRlbyhzZWxmLnN0cmVhbSlcbiAgc2VsZi5fcGMub25hZGRzdHJlYW0gPSBzZWxmLl9vbkFkZFN0cmVhbS5iaW5kKHNlbGYpXG5cbiAgaWYgKHNlbGYuaW5pdGlhdG9yKSB7XG4gICAgc2VsZi5fc2V0dXBEYXRhKHsgY2hhbm5lbDogc2VsZi5fcGMuY3JlYXRlRGF0YUNoYW5uZWwoc2VsZi5jaGFubmVsTmFtZSkgfSlcblxuICAgIHNlbGYuX3BjLm9ubmVnb3RpYXRpb25uZWVkZWQgPSBvbmNlKGZ1bmN0aW9uICgpIHtcbiAgICAgIHNlbGYuX3BjLmNyZWF0ZU9mZmVyKGZ1bmN0aW9uIChvZmZlcikge1xuICAgICAgICBzcGVlZEhhY2sob2ZmZXIpXG4gICAgICAgIHNlbGYuX3BjLnNldExvY2FsRGVzY3JpcHRpb24ob2ZmZXIpXG4gICAgICAgIHZhciBzZW5kT2ZmZXIgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgc2VsZi5lbWl0KCdzaWduYWwnLCBzZWxmLl9wYy5sb2NhbERlc2NyaXB0aW9uIHx8IG9mZmVyKVxuICAgICAgICB9XG4gICAgICAgIGlmIChzZWxmLnRyaWNrbGUgfHwgc2VsZi5faWNlQ29tcGxldGUpIHNlbmRPZmZlcigpXG4gICAgICAgIGVsc2Ugc2VsZi5vbmNlKCdfaWNlQ29tcGxldGUnLCBzZW5kT2ZmZXIpIC8vIHdhaXQgZm9yIGNhbmRpZGF0ZXNcbiAgICAgIH0sIHNlbGYuX29uRXJyb3IuYmluZChzZWxmKSlcbiAgICB9KVxuXG4gICAgaWYgKHdpbmRvdy5tb3pSVENQZWVyQ29ubmVjdGlvbikge1xuICAgICAgLy8gRmlyZWZveCBkb2VzIG5vdCB0cmlnZ2VyIHRoaXMgZXZlbnQgYXV0b21hdGljYWxseVxuICAgICAgc2V0VGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgIHNlbGYuX3BjLm9ubmVnb3RpYXRpb25uZWVkZWQoKVxuICAgICAgfSwgMClcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgc2VsZi5fcGMub25kYXRhY2hhbm5lbCA9IHNlbGYuX3NldHVwRGF0YS5iaW5kKHNlbGYpXG4gIH1cbn1cblxuLyoqXG4gKiBFeHBvc2UgY29uZmlnIGFuZCBjb25zdHJhaW50cyBmb3Igb3ZlcnJpZGluZyBhbGwgUGVlciBpbnN0YW5jZXMuIE90aGVyd2lzZSwganVzdFxuICogc2V0IG9wdHMuY29uZmlnIGFuZCBvcHRzLmNvbnN0cmFpbnRzIHdoZW4gY29uc3RydWN0aW5nIGEgUGVlci5cbiAqL1xuUGVlci5jb25maWcgPSB7IGljZVNlcnZlcnM6IFsgeyB1cmw6ICdzdHVuOjIzLjIxLjE1MC4xMjEnIH0gXSB9XG5QZWVyLmNvbnN0cmFpbnRzID0ge31cblxuUGVlci5wcm90b3R5cGUuc2VuZCA9IGZ1bmN0aW9uIChkYXRhLCBjYikge1xuICB2YXIgc2VsZiA9IHRoaXNcbiAgaWYgKCFzZWxmLl9jaGFubmVsUmVhZHkpIHJldHVybiBzZWxmLm9uY2UoJ3JlYWR5Jywgc2VsZi5zZW5kLmJpbmQoc2VsZiwgZGF0YSwgY2IpKVxuICBkZWJ1Zygnc2VuZCAlcycsIGRhdGEpXG5cbiAgaWYgKGlzVHlwZWRBcnJheS5zdHJpY3QoZGF0YSkgfHwgZGF0YSBpbnN0YW5jZW9mIEFycmF5QnVmZmVyIHx8XG4gICAgICBkYXRhIGluc3RhbmNlb2YgQmxvYiB8fCB0eXBlb2YgZGF0YSA9PT0gJ3N0cmluZycpIHtcbiAgICBzZWxmLl9jaGFubmVsLnNlbmQoZGF0YSlcbiAgfSBlbHNlIHtcbiAgICBzZWxmLl9jaGFubmVsLnNlbmQoSlNPTi5zdHJpbmdpZnkoZGF0YSkpXG4gIH1cbiAgaWYgKGNiKSBjYihudWxsKVxufVxuXG5QZWVyLnByb3RvdHlwZS5zaWduYWwgPSBmdW5jdGlvbiAoZGF0YSkge1xuICB2YXIgc2VsZiA9IHRoaXNcbiAgaWYgKHNlbGYuZGVzdHJveWVkKSByZXR1cm5cbiAgaWYgKHR5cGVvZiBkYXRhID09PSAnc3RyaW5nJykge1xuICAgIHRyeSB7XG4gICAgICBkYXRhID0gSlNPTi5wYXJzZShkYXRhKVxuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgZGF0YSA9IHt9XG4gICAgfVxuICB9XG4gIGRlYnVnKCdzaWduYWwgJXMnLCBKU09OLnN0cmluZ2lmeShkYXRhKSlcbiAgaWYgKGRhdGEuc2RwKSB7XG4gICAgc2VsZi5fcGMuc2V0UmVtb3RlRGVzY3JpcHRpb24obmV3IFJUQ1Nlc3Npb25EZXNjcmlwdGlvbihkYXRhKSwgZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIG5lZWRzQW5zd2VyID0gc2VsZi5fcGMucmVtb3RlRGVzY3JpcHRpb24udHlwZSA9PT0gJ29mZmVyJ1xuICAgICAgaWYgKG5lZWRzQW5zd2VyKSB7XG4gICAgICAgIHNlbGYuX3BjLmNyZWF0ZUFuc3dlcihmdW5jdGlvbiAoYW5zd2VyKSB7XG4gICAgICAgICAgc3BlZWRIYWNrKGFuc3dlcilcbiAgICAgICAgICBzZWxmLl9wYy5zZXRMb2NhbERlc2NyaXB0aW9uKGFuc3dlcilcbiAgICAgICAgICB2YXIgc2VuZEFuc3dlciA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHNlbGYuZW1pdCgnc2lnbmFsJywgc2VsZi5fcGMubG9jYWxEZXNjcmlwdGlvbiB8fCBhbnN3ZXIpXG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChzZWxmLnRyaWNrbGUgfHwgc2VsZi5faWNlQ29tcGxldGUpIHNlbmRBbnN3ZXIoKVxuICAgICAgICAgIGVsc2Ugc2VsZi5vbmNlKCdfaWNlQ29tcGxldGUnLCBzZW5kQW5zd2VyKVxuICAgICAgICB9LCBzZWxmLl9vbkVycm9yLmJpbmQoc2VsZikpXG4gICAgICB9XG4gICAgfSwgc2VsZi5fb25FcnJvci5iaW5kKHNlbGYpKVxuICB9XG4gIGlmIChkYXRhLmNhbmRpZGF0ZSkge1xuICAgIHRyeSB7XG4gICAgICBzZWxmLl9wYy5hZGRJY2VDYW5kaWRhdGUobmV3IFJUQ0ljZUNhbmRpZGF0ZShkYXRhLmNhbmRpZGF0ZSkpXG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBzZWxmLmRlc3Ryb3kobmV3IEVycm9yKCdlcnJvciBhZGRpbmcgY2FuZGlkYXRlLCAnICsgZXJyLm1lc3NhZ2UpKVxuICAgIH1cbiAgfVxuICBpZiAoIWRhdGEuc2RwICYmICFkYXRhLmNhbmRpZGF0ZSlcbiAgICBzZWxmLmRlc3Ryb3kobmV3IEVycm9yKCdzaWduYWwoKSBjYWxsZWQgd2l0aCBpbnZhbGlkIHNpZ25hbCBkYXRhJykpXG59XG5cblBlZXIucHJvdG90eXBlLmRlc3Ryb3kgPSBmdW5jdGlvbiAoZXJyLCBvbmNsb3NlKSB7XG4gIHZhciBzZWxmID0gdGhpc1xuICBpZiAoc2VsZi5kZXN0cm95ZWQpIHJldHVyblxuICBkZWJ1ZygnZGVzdHJveSAoZXJyb3I6ICVzKScsIGVyciAmJiBlcnIubWVzc2FnZSlcbiAgc2VsZi5kZXN0cm95ZWQgPSB0cnVlXG4gIHNlbGYucmVhZHkgPSBmYWxzZVxuXG4gIGlmICh0eXBlb2YgZXJyID09PSAnZnVuY3Rpb24nKSB7XG4gICAgb25jbG9zZSA9IGVyclxuICAgIGVyciA9IG51bGxcbiAgfVxuXG4gIGlmIChvbmNsb3NlKSBzZWxmLm9uY2UoJ2Nsb3NlJywgb25jbG9zZSlcblxuICBpZiAoc2VsZi5fcGMpIHtcbiAgICB0cnkge1xuICAgICAgc2VsZi5fcGMuY2xvc2UoKVxuICAgIH0gY2F0Y2ggKGVycikge31cblxuICAgIHNlbGYuX3BjLm9uaWNlY29ubmVjdGlvbnN0YXRlY2hhbmdlID0gbnVsbFxuICAgIHNlbGYuX3BjLm9uc2lnbmFsaW5nc3RhdGVjaGFuZ2UgPSBudWxsXG4gICAgc2VsZi5fcGMub25pY2VjYW5kaWRhdGUgPSBudWxsXG4gIH1cblxuICBpZiAoc2VsZi5fY2hhbm5lbCkge1xuICAgIHRyeSB7XG4gICAgICBzZWxmLl9jaGFubmVsLmNsb3NlKClcbiAgICB9IGNhdGNoIChlcnIpIHt9XG5cbiAgICBzZWxmLl9jaGFubmVsLm9ubWVzc2FnZSA9IG51bGxcbiAgICBzZWxmLl9jaGFubmVsLm9ub3BlbiA9IG51bGxcbiAgICBzZWxmLl9jaGFubmVsLm9uY2xvc2UgPSBudWxsXG4gIH1cbiAgc2VsZi5fcGMgPSBudWxsXG4gIHNlbGYuX2NoYW5uZWwgPSBudWxsXG5cbiAgc2VsZi5fZGF0YVN0cmVhbXMuZm9yRWFjaChmdW5jdGlvbiAoc3RyZWFtKSB7XG4gICAgaWYgKGVycikgc3RyZWFtLmVtaXQoJ2Vycm9yJywgZXJyKVxuICAgIGlmICghc3RyZWFtLl9yZWFkYWJsZVN0YXRlLmVuZGVkKSBzdHJlYW0ucHVzaChudWxsKVxuICAgIGlmICghc3RyZWFtLl93cml0YWJsZVN0YXRlLmZpbmlzaGVkKSBzdHJlYW0uZW5kKClcbiAgfSlcbiAgc2VsZi5fZGF0YVN0cmVhbXMgPSBbXVxuXG4gIGlmIChlcnIpIHNlbGYuZW1pdCgnZXJyb3InLCBlcnIpXG4gIHNlbGYuZW1pdCgnY2xvc2UnKVxufVxuXG5QZWVyLnByb3RvdHlwZS5nZXREYXRhU3RyZWFtID0gZnVuY3Rpb24gKG9wdHMpIHtcbiAgdmFyIHNlbGYgPSB0aGlzXG4gIGlmIChzZWxmLmRlc3Ryb3llZCkgdGhyb3cgbmV3IEVycm9yKCdwZWVyIGlzIGRlc3Ryb3llZCcpXG4gIHZhciBkYXRhU3RyZWFtID0gbmV3IERhdGFTdHJlYW0oZXh0ZW5kKHsgX3BlZXI6IHNlbGYgfSwgb3B0cykpXG4gIHNlbGYuX2RhdGFTdHJlYW1zLnB1c2goZGF0YVN0cmVhbSlcbiAgcmV0dXJuIGRhdGFTdHJlYW1cbn1cblxuUGVlci5wcm90b3R5cGUuX3NldHVwRGF0YSA9IGZ1bmN0aW9uIChldmVudCkge1xuICB2YXIgc2VsZiA9IHRoaXNcbiAgc2VsZi5fY2hhbm5lbCA9IGV2ZW50LmNoYW5uZWxcbiAgc2VsZi5jaGFubmVsTmFtZSA9IHNlbGYuX2NoYW5uZWwubGFiZWxcblxuICBzZWxmLl9jaGFubmVsLmJpbmFyeVR5cGUgPSAnYXJyYXlidWZmZXInXG4gIHNlbGYuX2NoYW5uZWwub25tZXNzYWdlID0gc2VsZi5fb25DaGFubmVsTWVzc2FnZS5iaW5kKHNlbGYpXG4gIHNlbGYuX2NoYW5uZWwub25vcGVuID0gc2VsZi5fb25DaGFubmVsT3Blbi5iaW5kKHNlbGYpXG4gIHNlbGYuX2NoYW5uZWwub25jbG9zZSA9IHNlbGYuX29uQ2hhbm5lbENsb3NlLmJpbmQoc2VsZilcbn1cblxuUGVlci5wcm90b3R5cGUuX3NldHVwVmlkZW8gPSBmdW5jdGlvbiAoc3RyZWFtKSB7XG4gIHZhciBzZWxmID0gdGhpc1xuICBzZWxmLl9wYy5hZGRTdHJlYW0oc3RyZWFtKVxufVxuXG5QZWVyLnByb3RvdHlwZS5fb25JY2VDb25uZWN0aW9uU3RhdGVDaGFuZ2UgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBzZWxmID0gdGhpc1xuICBpZiAoc2VsZi5kZXN0cm95ZWQpIHJldHVyblxuICB2YXIgaWNlR2F0aGVyaW5nU3RhdGUgPSBzZWxmLl9wYy5pY2VHYXRoZXJpbmdTdGF0ZVxuICB2YXIgaWNlQ29ubmVjdGlvblN0YXRlID0gc2VsZi5fcGMuaWNlQ29ubmVjdGlvblN0YXRlXG4gIHNlbGYuZW1pdCgnaWNlQ29ubmVjdGlvblN0YXRlQ2hhbmdlJywgaWNlR2F0aGVyaW5nU3RhdGUsIGljZUNvbm5lY3Rpb25TdGF0ZSlcbiAgZGVidWcoJ2ljZUNvbm5lY3Rpb25TdGF0ZUNoYW5nZSAlcyAlcycsIGljZUdhdGhlcmluZ1N0YXRlLCBpY2VDb25uZWN0aW9uU3RhdGUpXG4gIGlmIChpY2VDb25uZWN0aW9uU3RhdGUgPT09ICdjb25uZWN0ZWQnIHx8IGljZUNvbm5lY3Rpb25TdGF0ZSA9PT0gJ2NvbXBsZXRlZCcpIHtcbiAgICBzZWxmLl9wY1JlYWR5ID0gdHJ1ZVxuICAgIHNlbGYuX21heWJlUmVhZHkoKVxuICB9XG4gIGlmIChpY2VDb25uZWN0aW9uU3RhdGUgPT09ICdkaXNjb25uZWN0ZWQnIHx8IGljZUNvbm5lY3Rpb25TdGF0ZSA9PT0gJ2Nsb3NlZCcpXG4gICAgc2VsZi5kZXN0cm95KClcbn1cblxuUGVlci5wcm90b3R5cGUuX21heWJlUmVhZHkgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBzZWxmID0gdGhpc1xuICBkZWJ1ZygnbWF5YmVSZWFkeSBwYyAlcyBjaGFubmVsICVzJywgc2VsZi5fcGNSZWFkeSwgc2VsZi5fY2hhbm5lbFJlYWR5KVxuICBpZiAoIXNlbGYucmVhZHkgJiYgc2VsZi5fcGNSZWFkeSAmJiBzZWxmLl9jaGFubmVsUmVhZHkpIHtcbiAgICBkZWJ1ZygncmVhZHknKVxuICAgIHNlbGYucmVhZHkgPSB0cnVlXG4gICAgc2VsZi5lbWl0KCdyZWFkeScpXG4gIH1cbn1cblxuUGVlci5wcm90b3R5cGUuX29uU2lnbmFsaW5nU3RhdGVDaGFuZ2UgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBzZWxmID0gdGhpc1xuICBpZiAoc2VsZi5kZXN0cm95ZWQpIHJldHVyblxuICBzZWxmLmVtaXQoJ3NpZ25hbGluZ1N0YXRlQ2hhbmdlJywgc2VsZi5fcGMuc2lnbmFsaW5nU3RhdGUpXG4gIGRlYnVnKCdzaWduYWxpbmdTdGF0ZUNoYW5nZSAlcycsIHNlbGYuX3BjLnNpZ25hbGluZ1N0YXRlKVxufVxuXG5QZWVyLnByb3RvdHlwZS5fb25JY2VDYW5kaWRhdGUgPSBmdW5jdGlvbiAoZXZlbnQpIHtcbiAgdmFyIHNlbGYgPSB0aGlzXG4gIGlmIChzZWxmLmRlc3Ryb3llZCkgcmV0dXJuXG4gIGlmIChldmVudC5jYW5kaWRhdGUgJiYgc2VsZi50cmlja2xlKSB7XG4gICAgc2VsZi5lbWl0KCdzaWduYWwnLCB7IGNhbmRpZGF0ZTogZXZlbnQuY2FuZGlkYXRlIH0pXG4gIH0gZWxzZSBpZiAoIWV2ZW50LmNhbmRpZGF0ZSkge1xuICAgIHNlbGYuX2ljZUNvbXBsZXRlID0gdHJ1ZVxuICAgIHNlbGYuZW1pdCgnX2ljZUNvbXBsZXRlJylcbiAgfVxufVxuXG5QZWVyLnByb3RvdHlwZS5fb25DaGFubmVsTWVzc2FnZSA9IGZ1bmN0aW9uIChldmVudCkge1xuICB2YXIgc2VsZiA9IHRoaXNcbiAgaWYgKHNlbGYuZGVzdHJveWVkKSByZXR1cm5cbiAgdmFyIGRhdGEgPSBldmVudC5kYXRhXG4gIGRlYnVnKCdyZWNlaXZlICVzJywgZGF0YSlcblxuICBpZiAoZGF0YSBpbnN0YW5jZW9mIEFycmF5QnVmZmVyKSB7XG4gICAgZGF0YSA9IHRvQnVmZmVyKG5ldyBVaW50OEFycmF5KGRhdGEpKVxuICAgIHNlbGYuZW1pdCgnbWVzc2FnZScsIGRhdGEpXG4gIH0gZWxzZSB7XG4gICAgdHJ5IHtcbiAgICAgIHNlbGYuZW1pdCgnbWVzc2FnZScsIEpTT04ucGFyc2UoZGF0YSkpXG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBzZWxmLmVtaXQoJ21lc3NhZ2UnLCBkYXRhKVxuICAgIH1cbiAgfVxuICBzZWxmLl9kYXRhU3RyZWFtcy5mb3JFYWNoKGZ1bmN0aW9uIChzdHJlYW0pIHtcbiAgICBzdHJlYW0ucHVzaChkYXRhKVxuICB9KVxufVxuXG5QZWVyLnByb3RvdHlwZS5fb25DaGFubmVsT3BlbiA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIHNlbGYgPSB0aGlzXG4gIGlmIChzZWxmLmRlc3Ryb3llZCkgcmV0dXJuXG4gIHNlbGYuX2NoYW5uZWxSZWFkeSA9IHRydWVcbiAgc2VsZi5fbWF5YmVSZWFkeSgpXG59XG5cblBlZXIucHJvdG90eXBlLl9vbkNoYW5uZWxDbG9zZSA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIHNlbGYgPSB0aGlzXG4gIGlmIChzZWxmLmRlc3Ryb3llZCkgcmV0dXJuXG4gIHNlbGYuX2NoYW5uZWxSZWFkeSA9IGZhbHNlXG4gIHNlbGYuZGVzdHJveSgpXG59XG5cblBlZXIucHJvdG90eXBlLl9vbkFkZFN0cmVhbSA9IGZ1bmN0aW9uIChldmVudCkge1xuICB2YXIgc2VsZiA9IHRoaXNcbiAgaWYgKHNlbGYuZGVzdHJveWVkKSByZXR1cm5cbiAgc2VsZi5lbWl0KCdzdHJlYW0nLCBldmVudC5zdHJlYW0pXG59XG5cblBlZXIucHJvdG90eXBlLl9vbkVycm9yID0gZnVuY3Rpb24gKGVycikge1xuICB2YXIgc2VsZiA9IHRoaXNcbiAgaWYgKHNlbGYuZGVzdHJveWVkKSByZXR1cm5cbiAgZGVidWcoJ2Vycm9yICVzJywgZXJyLm1lc3NhZ2UpXG4gIHNlbGYuZGVzdHJveShlcnIpXG59XG5cbi8vIER1cGxleCBTdHJlYW0gZm9yIGRhdGEgY2hhbm5lbFxuXG5pbmhlcml0cyhEYXRhU3RyZWFtLCBzdHJlYW0uRHVwbGV4KVxuXG5mdW5jdGlvbiBEYXRhU3RyZWFtIChvcHRzKSB7XG4gIHZhciBzZWxmID0gdGhpc1xuICBzdHJlYW0uRHVwbGV4LmNhbGwoc2VsZiwgb3B0cylcbiAgc2VsZi5fcGVlciA9IG9wdHMuX3BlZXJcbiAgZGVidWcoJ25ldyBzdHJlYW0nKVxufVxuXG5EYXRhU3RyZWFtLnByb3RvdHlwZS5kZXN0cm95ID0gZnVuY3Rpb24gKCkge1xuICB2YXIgc2VsZiA9IHRoaXNcbiAgc2VsZi5fcGVlci5kZXN0cm95KClcbn1cblxuRGF0YVN0cmVhbS5wcm90b3R5cGUuX3JlYWQgPSBmdW5jdGlvbiAoKSB7fVxuXG5EYXRhU3RyZWFtLnByb3RvdHlwZS5fd3JpdGUgPSBmdW5jdGlvbiAoY2h1bmssIGVuY29kaW5nLCBjYikge1xuICB2YXIgc2VsZiA9IHRoaXNcbiAgc2VsZi5fcGVlci5zZW5kKGNodW5rLCBjYilcbn1cblxuZnVuY3Rpb24gc3BlZWRIYWNrIChvYmopIHtcbiAgdmFyIHMgPSBvYmouc2RwLnNwbGl0KCdiPUFTOjMwJylcbiAgaWYgKHMubGVuZ3RoID4gMSlcbiAgICBvYmouc2RwID0gc1swXSArICdiPUFTOjE2Mzg0MDAnICsgc1sxXVxufVxuIiwiLyoqXG4gKiBDb252ZXJ0IGEgdHlwZWQgYXJyYXkgdG8gYSBCdWZmZXIgd2l0aG91dCBhIGNvcHlcbiAqXG4gKiBBdXRob3I6ICAgRmVyb3NzIEFib3VraGFkaWplaCA8ZmVyb3NzQGZlcm9zcy5vcmc+IDxodHRwOi8vZmVyb3NzLm9yZz5cbiAqIExpY2Vuc2U6ICBNSVRcbiAqXG4gKiBgbnBtIGluc3RhbGwgdHlwZWRhcnJheS10by1idWZmZXJgXG4gKi9cblxudmFyIGlzVHlwZWRBcnJheSA9IHJlcXVpcmUoJ2lzLXR5cGVkYXJyYXknKS5zdHJpY3RcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoYXJyKSB7XG4gIC8vIElmIGBCdWZmZXJgIGlzIHRoZSBicm93c2VyIGBidWZmZXJgIG1vZHVsZSwgYW5kIHRoZSBicm93c2VyIHN1cHBvcnRzIHR5cGVkIGFycmF5cyxcbiAgLy8gdGhlbiBhdm9pZCBhIGNvcHkuIE90aGVyd2lzZSwgY3JlYXRlIGEgYEJ1ZmZlcmAgd2l0aCBhIGNvcHkuXG4gIHZhciBjb25zdHJ1Y3RvciA9IEJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUXG4gICAgPyBCdWZmZXIuX2F1Z21lbnRcbiAgICA6IGZ1bmN0aW9uIChhcnIpIHsgcmV0dXJuIG5ldyBCdWZmZXIoYXJyKSB9XG5cbiAgaWYgKGFyciBpbnN0YW5jZW9mIFVpbnQ4QXJyYXkpIHtcbiAgICByZXR1cm4gY29uc3RydWN0b3IoYXJyKVxuICB9IGVsc2UgaWYgKGFyciBpbnN0YW5jZW9mIEFycmF5QnVmZmVyKSB7XG4gICAgcmV0dXJuIGNvbnN0cnVjdG9yKG5ldyBVaW50OEFycmF5KGFycikpXG4gIH0gZWxzZSBpZiAoaXNUeXBlZEFycmF5KGFycikpIHtcbiAgICAvLyBVc2UgdGhlIHR5cGVkIGFycmF5J3MgdW5kZXJseWluZyBBcnJheUJ1ZmZlciB0byBiYWNrIG5ldyBCdWZmZXIuIFRoaXMgcmVzcGVjdHNcbiAgICAvLyB0aGUgXCJ2aWV3XCIgb24gdGhlIEFycmF5QnVmZmVyLCBpLmUuIGJ5dGVPZmZzZXQgYW5kIGJ5dGVMZW5ndGguIE5vIGNvcHkuXG4gICAgcmV0dXJuIGNvbnN0cnVjdG9yKG5ldyBVaW50OEFycmF5KGFyci5idWZmZXIsIGFyci5ieXRlT2Zmc2V0LCBhcnIuYnl0ZUxlbmd0aCkpXG4gIH0gZWxzZSB7XG4gICAgLy8gVW5zdXBwb3J0ZWQgdHlwZSwganVzdCBwYXNzIGl0IHRocm91Z2ggdG8gdGhlIGBCdWZmZXJgIGNvbnN0cnVjdG9yLlxuICAgIHJldHVybiBuZXcgQnVmZmVyKGFycilcbiAgfVxufVxuIiwibW9kdWxlLmV4cG9ydHMgPSBTb2NrZXRcblxudmFyIEV2ZW50RW1pdHRlciA9IHJlcXVpcmUoJ2V2ZW50cycpLkV2ZW50RW1pdHRlclxudmFyIGluaGVyaXRzID0gcmVxdWlyZSgnaW5oZXJpdHMnKVxudmFyIG9uY2UgPSByZXF1aXJlKCdvbmNlJylcblxudmFyIFJFQ09OTkVDVF9USU1FT1VUID0gNTAwMFxuXG5pbmhlcml0cyhTb2NrZXQsIEV2ZW50RW1pdHRlcilcblxuZnVuY3Rpb24gU29ja2V0ICh1cmwsIG9wdHMpIHtcbiAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIFNvY2tldCkpIHJldHVybiBuZXcgU29ja2V0KHVybCwgb3B0cylcbiAgRXZlbnRFbWl0dGVyLmNhbGwodGhpcylcbiAgaWYgKCFvcHRzKSBvcHRzID0ge31cblxuICB0aGlzLl91cmwgPSB1cmxcbiAgdGhpcy5fcmVjb25uZWN0ID0gKG9wdHMucmVjb25uZWN0ICE9PSB1bmRlZmluZWQpXG4gICAgPyBvcHRzLnJlY29ubmVjdFxuICAgIDogUkVDT05ORUNUX1RJTUVPVVRcbiAgdGhpcy5faW5pdCgpXG59XG5cblNvY2tldC5wcm90b3R5cGUuc2VuZCA9IGZ1bmN0aW9uIChtZXNzYWdlKSB7XG4gIGlmICh0aGlzLl93cyAmJiB0aGlzLl93cy5yZWFkeVN0YXRlID09PSBXZWJTb2NrZXQuT1BFTikge1xuICAgIGlmICh0eXBlb2YgbWVzc2FnZSA9PT0gJ29iamVjdCcpXG4gICAgICBtZXNzYWdlID0gSlNPTi5zdHJpbmdpZnkobWVzc2FnZSlcbiAgICB0aGlzLl93cy5zZW5kKG1lc3NhZ2UpXG4gIH1cbn1cblxuU29ja2V0LnByb3RvdHlwZS5kZXN0cm95ID0gZnVuY3Rpb24gKG9uY2xvc2UpIHtcbiAgaWYgKG9uY2xvc2UpIHRoaXMub25jZSgnY2xvc2UnLCBvbmNsb3NlKVxuICB0cnkge1xuICAgIHRoaXMuX3dzLmNsb3NlKClcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgdGhpcy5fb25jbG9zZSgpXG4gIH1cbn1cblxuU29ja2V0LnByb3RvdHlwZS5faW5pdCA9IGZ1bmN0aW9uICgpIHtcbiAgdGhpcy5fZXJyb3JlZCA9IGZhbHNlXG4gIHRoaXMuX3dzID0gbmV3IFdlYlNvY2tldCh0aGlzLl91cmwpXG4gIHRoaXMuX3dzLm9ub3BlbiA9IHRoaXMuX29ub3Blbi5iaW5kKHRoaXMpXG4gIHRoaXMuX3dzLm9ubWVzc2FnZSA9IHRoaXMuX29ubWVzc2FnZS5iaW5kKHRoaXMpXG4gIHRoaXMuX3dzLm9uY2xvc2UgPSB0aGlzLl9vbmNsb3NlLmJpbmQodGhpcylcbiAgdGhpcy5fd3Mub25lcnJvciA9IG9uY2UodGhpcy5fb25lcnJvci5iaW5kKHRoaXMpKVxufVxuXG5Tb2NrZXQucHJvdG90eXBlLl9vbm9wZW4gPSBmdW5jdGlvbiAoKSB7XG4gIHRoaXMuZW1pdCgncmVhZHknKVxufVxuXG5Tb2NrZXQucHJvdG90eXBlLl9vbmVycm9yID0gZnVuY3Rpb24gKGVycikge1xuICB0aGlzLl9lcnJvcmVkID0gdHJ1ZVxuXG4gIC8vIE9uIGVycm9yLCBjbG9zZSBzb2NrZXQuLi5cbiAgdGhpcy5kZXN0cm95KClcblxuICAvLyAuLi5hbmQgdHJ5IHRvIHJlY29ubmVjdCBhZnRlciBhIHRpbWVvdXRcbiAgaWYgKHRoaXMuX3JlY29ubmVjdCkge1xuICAgIHRoaXMuX3RpbWVvdXQgPSBzZXRUaW1lb3V0KHRoaXMuX2luaXQuYmluZCh0aGlzKSwgdGhpcy5fcmVjb25uZWN0KVxuICAgIHRoaXMuZW1pdCgnd2FybmluZycsIGVycilcbiAgfSBlbHNlIHtcbiAgICB0aGlzLmVtaXQoJ2Vycm9yJywgZXJyKVxuICB9XG59XG5cblxuU29ja2V0LnByb3RvdHlwZS5fb25tZXNzYWdlID0gZnVuY3Rpb24gKGV2ZW50KSB7XG4gIHZhciBtZXNzYWdlID0gZXZlbnQuZGF0YVxuICB0cnkge1xuICAgIG1lc3NhZ2UgPSBKU09OLnBhcnNlKGV2ZW50LmRhdGEpXG4gIH0gY2F0Y2ggKGVycikge31cbiAgdGhpcy5lbWl0KCdtZXNzYWdlJywgbWVzc2FnZSlcbn1cblxuU29ja2V0LnByb3RvdHlwZS5fb25jbG9zZSA9IGZ1bmN0aW9uICgpIHtcbiAgY2xlYXJUaW1lb3V0KHRoaXMuX3RpbWVvdXQpXG4gIGlmICh0aGlzLl93cykge1xuICAgIHRoaXMuX3dzLm9ub3BlbiA9IG51bGxcbiAgICB0aGlzLl93cy5vbmVycm9yID0gbnVsbFxuICAgIHRoaXMuX3dzLm9ubWVzc2FnZSA9IG51bGxcbiAgICB0aGlzLl93cy5vbmNsb3NlID0gbnVsbFxuICB9XG4gIHRoaXMuX3dzID0gbnVsbFxuICBpZiAoIXRoaXMuX2Vycm9yZWQpIHRoaXMuZW1pdCgnY2xvc2UnKVxufVxuIiwidmFyIGJlbmNvZGUgPSByZXF1aXJlKCdiZW5jb2RlJylcbnZhciBCaXRGaWVsZCA9IHJlcXVpcmUoJ2JpdGZpZWxkJylcbnZhciBFdmVudEVtaXR0ZXIgPSByZXF1aXJlKCdldmVudHMnKS5FdmVudEVtaXR0ZXJcbnZhciBpbmhlcml0cyA9IHJlcXVpcmUoJ2luaGVyaXRzJylcbnZhciBzaGExID0gcmVxdWlyZSgnc2ltcGxlLXNoYTEnKVxuXG52YXIgTUFYX01FVEFEQVRBX1NJWkUgPSAxMDAwMDAwMCAvLyAxME1CXG52YXIgQklURklFTERfR1JPVyA9IDEwMDBcbnZhciBQSUVDRV9MRU5HVEggPSAxNiAqIDEwMjRcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAobWV0YWRhdGEpIHtcblxuICBpbmhlcml0cyh1dF9tZXRhZGF0YSwgRXZlbnRFbWl0dGVyKVxuXG4gIGZ1bmN0aW9uIHV0X21ldGFkYXRhICh3aXJlKSB7XG4gICAgRXZlbnRFbWl0dGVyLmNhbGwodGhpcylcblxuICAgIHRoaXMuX3dpcmUgPSB3aXJlXG5cbiAgICB0aGlzLl9tZXRhZGF0YUNvbXBsZXRlID0gZmFsc2VcbiAgICB0aGlzLl9tZXRhZGF0YVNpemUgPSBudWxsXG4gICAgdGhpcy5fcmVtYWluaW5nUmVqZWN0cyA9IG51bGwgLy8gaG93IG1hbnkgcmVqZWN0IG1lc3NhZ2VzIHRvIHRvbGVyYXRlIGJlZm9yZSBxdWl0dGluZ1xuICAgIHRoaXMuX2ZldGNoaW5nID0gZmFsc2VcblxuICAgIC8vIFRoZSBsYXJnZXN0IC50b3JyZW50IGZpbGUgdGhhdCBJIGtub3cgb2YgaXMgfjEtMk1CLCB3aGljaCBpcyB+MTAwIHBpZWNlcy5cbiAgICAvLyBUaGVyZWZvcmUsIGNhcCB0aGUgYml0ZmllbGQgdG8gMTB4IHRoYXQgKDEwMDAgcGllY2VzKSBzbyBhIG1hbGljaW91cyBwZWVyIGNhbid0XG4gICAgLy8gbWFrZSBpdCBncm93IHRvIGZpbGwgYWxsIG1lbW9yeS5cbiAgICB0aGlzLl9iaXRmaWVsZCA9IG5ldyBCaXRGaWVsZCgwLCB7IGdyb3c6IEJJVEZJRUxEX0dST1cgfSlcblxuICAgIGlmIChCdWZmZXIuaXNCdWZmZXIobWV0YWRhdGEpKSB7XG4gICAgICB0aGlzLnNldE1ldGFkYXRhKG1ldGFkYXRhKVxuICAgIH1cbiAgfVxuXG4gIC8vIE5hbWUgb2YgdGhlIGJpdHRvcnJlbnQtcHJvdG9jb2wgZXh0ZW5zaW9uXG4gIHV0X21ldGFkYXRhLnByb3RvdHlwZS5uYW1lID0gJ3V0X21ldGFkYXRhJ1xuXG4gIHV0X21ldGFkYXRhLnByb3RvdHlwZS5vbkhhbmRzaGFrZSA9IGZ1bmN0aW9uIChpbmZvSGFzaCwgcGVlcklkLCBleHRlbnNpb25zKSB7XG4gICAgdGhpcy5faW5mb0hhc2ggPSBpbmZvSGFzaFxuICAgIHRoaXMuX2luZm9IYXNoSGV4ID0gaW5mb0hhc2gudG9TdHJpbmcoJ2hleCcpXG4gIH1cblxuICB1dF9tZXRhZGF0YS5wcm90b3R5cGUub25FeHRlbmRlZEhhbmRzaGFrZSA9IGZ1bmN0aW9uIChoYW5kc2hha2UpIHtcbiAgICBpZiAoIWhhbmRzaGFrZS5tIHx8ICFoYW5kc2hha2UubS51dF9tZXRhZGF0YSkge1xuICAgICAgcmV0dXJuIHRoaXMuZW1pdCgnd2FybmluZycsIG5ldyBFcnJvcignUGVlciBkb2VzIG5vdCBzdXBwb3J0IHV0X21ldGFkYXRhJykpXG4gICAgfVxuICAgIGlmICghaGFuZHNoYWtlLm1ldGFkYXRhX3NpemUpIHtcbiAgICAgIHJldHVybiB0aGlzLmVtaXQoJ3dhcm5pbmcnLCBuZXcgRXJyb3IoJ1BlZXIgZG9lcyBub3QgaGF2ZSBtZXRhZGF0YScpKVxuICAgIH1cblxuICAgIGlmIChoYW5kc2hha2UubWV0YWRhdGFfc2l6ZSA+IE1BWF9NRVRBREFUQV9TSVpFKSB7XG4gICAgICByZXR1cm4gdGhpcy5lbWl0KCd3YXJuaW5nJywgbmV3IEVycm9yKCdQZWVyIGdhdmUgbWFsaWNpb3VzbHkgbGFyZ2UgbWV0YWRhdGEgc2l6ZScpKVxuICAgIH1cblxuICAgIHRoaXMuX21ldGFkYXRhU2l6ZSA9IGhhbmRzaGFrZS5tZXRhZGF0YV9zaXplXG4gICAgdGhpcy5fbnVtUGllY2VzID0gTWF0aC5jZWlsKHRoaXMuX21ldGFkYXRhU2l6ZSAvIFBJRUNFX0xFTkdUSClcbiAgICB0aGlzLl9yZW1haW5pbmdSZWplY3RzID0gdGhpcy5fbnVtUGllY2VzICogMlxuXG4gICAgaWYgKHRoaXMuX2ZldGNoaW5nKSB7XG4gICAgICB0aGlzLl9yZXF1ZXN0UGllY2VzKClcbiAgICB9XG4gIH1cblxuICB1dF9tZXRhZGF0YS5wcm90b3R5cGUub25NZXNzYWdlID0gZnVuY3Rpb24gKGJ1Zikge1xuICAgIHZhciBkaWN0LCB0cmFpbGVyXG4gICAgdHJ5IHtcbiAgICAgIHZhciBzdHIgPSBidWYudG9TdHJpbmcoKVxuICAgICAgdmFyIHRyYWlsZXJJbmRleCA9IHN0ci5pbmRleE9mKCdlZScpICsgMlxuICAgICAgZGljdCA9IGJlbmNvZGUuZGVjb2RlKHN0ci5zdWJzdHJpbmcoMCwgdHJhaWxlckluZGV4KSlcbiAgICAgIHRyYWlsZXIgPSBidWYuc2xpY2UodHJhaWxlckluZGV4KVxuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgLy8gZHJvcCBpbnZhbGlkIG1lc3NhZ2VzXG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICBzd2l0Y2ggKGRpY3QubXNnX3R5cGUpIHtcbiAgICAgIGNhc2UgMDpcbiAgICAgICAgLy8gdXRfbWV0YWRhdGEgcmVxdWVzdCAoZnJvbSBwZWVyKVxuICAgICAgICAvLyBleGFtcGxlOiB7ICdtc2dfdHlwZSc6IDAsICdwaWVjZSc6IDAgfVxuICAgICAgICB0aGlzLl9vblJlcXVlc3QoZGljdC5waWVjZSlcbiAgICAgICAgYnJlYWtcbiAgICAgIGNhc2UgMTpcbiAgICAgICAgLy8gdXRfbWV0YWRhdGEgZGF0YSAoaW4gcmVzcG9uc2UgdG8gb3VyIHJlcXVlc3QpXG4gICAgICAgIC8vIGV4YW1wbGU6IHsgJ21zZ190eXBlJzogMSwgJ3BpZWNlJzogMCwgJ3RvdGFsX3NpemUnOiAzNDI1IH1cbiAgICAgICAgdGhpcy5fb25EYXRhKGRpY3QucGllY2UsIHRyYWlsZXIsIGRpY3QudG90YWxfc2l6ZSlcbiAgICAgICAgYnJlYWtcbiAgICAgIGNhc2UgMjpcbiAgICAgICAgLy8gdXRfbWV0YWRhdGEgcmVqZWN0IChwZWVyIGRvZXNuJ3QgaGF2ZSBwaWVjZSB3ZSByZXF1ZXN0ZWQpXG4gICAgICAgIC8vIHsgJ21zZ190eXBlJzogMiwgJ3BpZWNlJzogMCB9XG4gICAgICAgIHRoaXMuX29uUmVqZWN0KGRpY3QucGllY2UpXG4gICAgICAgIGJyZWFrXG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEFzayB0aGUgcGVlciB0byBzZW5kIG1ldGFkYXRhLlxuICAgKiBAcHVibGljXG4gICAqL1xuICB1dF9tZXRhZGF0YS5wcm90b3R5cGUuZmV0Y2ggPSBmdW5jdGlvbiAoKSB7XG4gICAgaWYgKHRoaXMuX21ldGFkYXRhQ29tcGxldGUpIHtcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICB0aGlzLl9mZXRjaGluZyA9IHRydWVcbiAgICBpZiAodGhpcy5fbWV0YWRhdGFTaXplKSB7XG4gICAgICB0aGlzLl9yZXF1ZXN0UGllY2VzKClcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogU3RvcCBhc2tpbmcgdGhlIHBlZXIgdG8gc2VuZCBtZXRhZGF0YS5cbiAgICogQHB1YmxpY1xuICAgKi9cbiAgdXRfbWV0YWRhdGEucHJvdG90eXBlLmNhbmNlbCA9IGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLl9mZXRjaGluZyA9IGZhbHNlXG4gIH1cblxuICB1dF9tZXRhZGF0YS5wcm90b3R5cGUuc2V0TWV0YWRhdGEgPSBmdW5jdGlvbiAobWV0YWRhdGEpIHtcbiAgICBpZiAodGhpcy5fbWV0YWRhdGFDb21wbGV0ZSkgcmV0dXJuIHRydWVcblxuICAgIC8vIGlmIGZ1bGwgdG9ycmVudCBkaWN0aW9uYXJ5IHdhcyBwYXNzZWQgaW4sIHB1bGwgb3V0IGp1c3QgYGluZm9gIGtleVxuICAgIHRyeSB7XG4gICAgICB2YXIgaW5mbyA9IGJlbmNvZGUuZGVjb2RlKG1ldGFkYXRhKS5pbmZvXG4gICAgICBpZiAoaW5mbykge1xuICAgICAgICBtZXRhZGF0YSA9IGJlbmNvZGUuZW5jb2RlKGluZm8pXG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyKSB7fVxuXG4gICAgLy8gY2hlY2sgaGFzaFxuICAgIGlmICh0aGlzLl9pbmZvSGFzaEhleCAmJiB0aGlzLl9pbmZvSGFzaEhleCAhPT0gc2hhMS5zeW5jKG1ldGFkYXRhKSkge1xuICAgICAgcmV0dXJuIGZhbHNlXG4gICAgfVxuXG4gICAgdGhpcy5jYW5jZWwoKVxuXG4gICAgdGhpcy5tZXRhZGF0YSA9IG1ldGFkYXRhXG4gICAgdGhpcy5fbWV0YWRhdGFDb21wbGV0ZSA9IHRydWVcbiAgICB0aGlzLl9tZXRhZGF0YVNpemUgPSB0aGlzLm1ldGFkYXRhLmxlbmd0aFxuICAgIHRoaXMuX3dpcmUuZXh0ZW5kZWRIYW5kc2hha2UubWV0YWRhdGFfc2l6ZSA9IHRoaXMuX21ldGFkYXRhU2l6ZVxuXG4gICAgdGhpcy5lbWl0KCdtZXRhZGF0YScsIGJlbmNvZGUuZW5jb2RlKHsgaW5mbzogYmVuY29kZS5kZWNvZGUodGhpcy5tZXRhZGF0YSkgfSkpXG5cbiAgICByZXR1cm4gdHJ1ZVxuICB9XG5cbiAgdXRfbWV0YWRhdGEucHJvdG90eXBlLl9zZW5kID0gZnVuY3Rpb24gKGRpY3QsIHRyYWlsZXIpIHtcbiAgICB2YXIgYnVmID0gYmVuY29kZS5lbmNvZGUoZGljdClcbiAgICBpZiAoQnVmZmVyLmlzQnVmZmVyKHRyYWlsZXIpKSB7XG4gICAgICBidWYgPSBCdWZmZXIuY29uY2F0KFtidWYsIHRyYWlsZXJdKVxuICAgIH1cbiAgICB0aGlzLl93aXJlLmV4dGVuZGVkKCd1dF9tZXRhZGF0YScsIGJ1ZilcbiAgfVxuXG4gIHV0X21ldGFkYXRhLnByb3RvdHlwZS5fcmVxdWVzdCA9IGZ1bmN0aW9uIChwaWVjZSkge1xuICAgIHRoaXMuX3NlbmQoeyBtc2dfdHlwZTogMCwgcGllY2U6IHBpZWNlIH0pXG4gIH1cblxuICB1dF9tZXRhZGF0YS5wcm90b3R5cGUuX2RhdGEgPSBmdW5jdGlvbiAocGllY2UsIGJ1ZiwgdG90YWxTaXplKSB7XG4gICAgdmFyIG1zZyA9IHsgbXNnX3R5cGU6IDEsIHBpZWNlOiBwaWVjZSB9XG4gICAgaWYgKHR5cGVvZiB0b3RhbFNpemUgPT09ICdudW1iZXInKSB7XG4gICAgICBtc2cudG90YWxfc2l6ZSA9IHRvdGFsU2l6ZVxuICAgIH1cbiAgICB0aGlzLl9zZW5kKG1zZywgYnVmKVxuICB9XG5cbiAgdXRfbWV0YWRhdGEucHJvdG90eXBlLl9yZWplY3QgPSBmdW5jdGlvbiAocGllY2UpIHtcbiAgICB0aGlzLl9zZW5kKHsgbXNnX3R5cGU6IDIsIHBpZWNlOiBwaWVjZSB9KVxuICB9XG5cbiAgdXRfbWV0YWRhdGEucHJvdG90eXBlLl9vblJlcXVlc3QgPSBmdW5jdGlvbiAocGllY2UpIHtcbiAgICBpZiAoIXRoaXMuX21ldGFkYXRhQ29tcGxldGUpIHtcbiAgICAgIHRoaXMuX3JlamVjdChwaWVjZSlcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICB2YXIgc3RhcnQgPSBwaWVjZSAqIFBJRUNFX0xFTkdUSFxuICAgIHZhciBlbmQgPSBzdGFydCArIFBJRUNFX0xFTkdUSFxuICAgIGlmIChlbmQgPiB0aGlzLl9tZXRhZGF0YVNpemUpIHtcbiAgICAgIGVuZCA9IHRoaXMuX21ldGFkYXRhU2l6ZVxuICAgIH1cbiAgICB2YXIgYnVmID0gdGhpcy5tZXRhZGF0YS5zbGljZShzdGFydCwgZW5kKVxuICAgIHRoaXMuX2RhdGEocGllY2UsIGJ1ZiwgdGhpcy5fbWV0YWRhdGFTaXplKVxuICB9XG5cbiAgdXRfbWV0YWRhdGEucHJvdG90eXBlLl9vbkRhdGEgPSBmdW5jdGlvbiAocGllY2UsIGJ1ZiwgdG90YWxTaXplKSB7XG4gICAgaWYgKGJ1Zi5sZW5ndGggPiBQSUVDRV9MRU5HVEgpIHtcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICBidWYuY29weSh0aGlzLm1ldGFkYXRhLCBwaWVjZSAqIFBJRUNFX0xFTkdUSClcbiAgICB0aGlzLl9iaXRmaWVsZC5zZXQocGllY2UpXG4gICAgdGhpcy5fY2hlY2tEb25lKClcbiAgfVxuXG4gIHV0X21ldGFkYXRhLnByb3RvdHlwZS5fb25SZWplY3QgPSBmdW5jdGlvbiAocGllY2UpIHtcbiAgICBpZiAodGhpcy5fcmVtYWluaW5nUmVqZWN0cyA+IDAgJiYgdGhpcy5fZmV0Y2hpbmcpIHtcbiAgICAgIC8vIElmIHdlIGhhdmVuJ3QgYmVlbiByZWplY3RlZCB0b28gbXVjaCwgdGhlbiB0cnkgdG8gcmVxdWVzdCB0aGUgcGllY2UgYWdhaW5cbiAgICAgIHRoaXMuX3JlcXVlc3QocGllY2UpXG4gICAgICB0aGlzLl9yZW1haW5pbmdSZWplY3RzIC09IDFcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5lbWl0KCd3YXJuaW5nJywgbmV3IEVycm9yKCdQZWVyIHNlbnQgXCJyZWplY3RcIiB0b28gbXVjaCcpKVxuICAgIH1cbiAgfVxuXG4gIHV0X21ldGFkYXRhLnByb3RvdHlwZS5fcmVxdWVzdFBpZWNlcyA9IGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLm1ldGFkYXRhID0gbmV3IEJ1ZmZlcih0aGlzLl9tZXRhZGF0YVNpemUpXG5cbiAgICBmb3IgKHZhciBwaWVjZSA9IDA7IHBpZWNlIDwgdGhpcy5fbnVtUGllY2VzOyBwaWVjZSsrKSB7XG4gICAgICB0aGlzLl9yZXF1ZXN0KHBpZWNlKVxuICAgIH1cbiAgfVxuXG4gIHV0X21ldGFkYXRhLnByb3RvdHlwZS5fY2hlY2tEb25lID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciBkb25lID0gdHJ1ZVxuICAgIGZvciAodmFyIHBpZWNlID0gMDsgcGllY2UgPCB0aGlzLl9udW1QaWVjZXM7IHBpZWNlKyspIHtcbiAgICAgIGlmICghdGhpcy5fYml0ZmllbGQuZ2V0KHBpZWNlKSkge1xuICAgICAgICBkb25lID0gZmFsc2VcbiAgICAgICAgYnJlYWtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKCFkb25lKSByZXR1cm5cblxuICAgIC8vIGF0dGVtcHQgdG8gc2V0IG1ldGFkYXRhIC0tIG1heSBmYWlsIHNoYTEgY2hlY2tcbiAgICB2YXIgc3VjY2VzcyA9IHRoaXMuc2V0TWV0YWRhdGEodGhpcy5tZXRhZGF0YSlcblxuICAgIGlmICghc3VjY2Vzcykge1xuICAgICAgdGhpcy5fZmFpbGVkTWV0YWRhdGEoKVxuICAgIH1cbiAgfVxuXG4gIHV0X21ldGFkYXRhLnByb3RvdHlwZS5fZmFpbGVkTWV0YWRhdGEgPSBmdW5jdGlvbiAoKSB7XG4gICAgLy8gcmVzZXQgYml0ZmllbGQgJiB0cnkgYWdhaW5cbiAgICB0aGlzLl9iaXRmaWVsZCA9IG5ldyBCaXRGaWVsZCgwLCB7IGdyb3c6IEJJVEZJRUxEX0dST1cgfSlcbiAgICB0aGlzLl9yZW1haW5pbmdSZWplY3RzIC09IHRoaXMuX251bVBpZWNlc1xuICAgIGlmICh0aGlzLl9yZW1haW5pbmdSZWplY3RzID4gMCkge1xuICAgICAgdGhpcy5fcmVxdWVzdFBpZWNlcygpXG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuZW1pdCgnd2FybmluZycsIG5ldyBFcnJvcignUGVlciBzZW50IGludmFsaWQgbWV0YWRhdGEnKSlcbiAgICB9XG4gIH1cblxuICByZXR1cm4gdXRfbWV0YWRhdGFcbn1cbiIsInZhciBEaWN0ID0gcmVxdWlyZShcIi4vZGljdFwiKVxuXG4vKipcbiAqIERlY29kZXMgYmVuY29kZWQgZGF0YS5cbiAqXG4gKiBAcGFyYW0gIHtCdWZmZXJ9IGRhdGFcbiAqIEBwYXJhbSAge1N0cmluZ30gZW5jb2RpbmdcbiAqIEByZXR1cm4ge09iamVjdHxBcnJheXxCdWZmZXJ8U3RyaW5nfE51bWJlcn1cbiAqL1xuZnVuY3Rpb24gZGVjb2RlKCBkYXRhLCBlbmNvZGluZyApIHtcblxuICBkZWNvZGUucG9zaXRpb24gPSAwXG4gIGRlY29kZS5lbmNvZGluZyA9IGVuY29kaW5nIHx8IG51bGxcblxuICBkZWNvZGUuZGF0YSA9ICEoIEJ1ZmZlci5pc0J1ZmZlcihkYXRhKSApXG4gICAgPyBuZXcgQnVmZmVyKCBkYXRhIClcbiAgICA6IGRhdGFcblxuICByZXR1cm4gZGVjb2RlLm5leHQoKVxuXG59XG5cbmRlY29kZS5wb3NpdGlvbiA9IDBcbmRlY29kZS5kYXRhICAgICA9IG51bGxcbmRlY29kZS5lbmNvZGluZyA9IG51bGxcblxuZGVjb2RlLm5leHQgPSBmdW5jdGlvbigpIHtcblxuICBzd2l0Y2goIGRlY29kZS5kYXRhW2RlY29kZS5wb3NpdGlvbl0gKSB7XG4gICAgY2FzZSAweDY0OiByZXR1cm4gZGVjb2RlLmRpY3Rpb25hcnkoKTsgYnJlYWtcbiAgICBjYXNlIDB4NkM6IHJldHVybiBkZWNvZGUubGlzdCgpOyBicmVha1xuICAgIGNhc2UgMHg2OTogcmV0dXJuIGRlY29kZS5pbnRlZ2VyKCk7IGJyZWFrXG4gICAgZGVmYXVsdDogICByZXR1cm4gZGVjb2RlLmJ5dGVzKCk7IGJyZWFrXG4gIH1cblxufVxuXG5kZWNvZGUuZmluZCA9IGZ1bmN0aW9uKCBjaHIgKSB7XG5cbiAgdmFyIGkgPSBkZWNvZGUucG9zaXRpb25cbiAgdmFyIGMgPSBkZWNvZGUuZGF0YS5sZW5ndGhcbiAgdmFyIGQgPSBkZWNvZGUuZGF0YVxuXG4gIHdoaWxlKCBpIDwgYyApIHtcbiAgICBpZiggZFtpXSA9PT0gY2hyIClcbiAgICAgIHJldHVybiBpXG4gICAgaSsrXG4gIH1cblxuICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgJ0ludmFsaWQgZGF0YTogTWlzc2luZyBkZWxpbWl0ZXIgXCInICtcbiAgICBTdHJpbmcuZnJvbUNoYXJDb2RlKCBjaHIgKSArICdcIiBbMHgnICtcbiAgICBjaHIudG9TdHJpbmcoIDE2ICkgKyAnXSdcbiAgKVxuXG59XG5cbmRlY29kZS5kaWN0aW9uYXJ5ID0gZnVuY3Rpb24oKSB7XG5cbiAgZGVjb2RlLnBvc2l0aW9uKytcblxuICB2YXIgZGljdCA9IG5ldyBEaWN0KClcblxuICB3aGlsZSggZGVjb2RlLmRhdGFbZGVjb2RlLnBvc2l0aW9uXSAhPT0gMHg2NSApIHtcbiAgICBkaWN0LmJpbmFyeVNldChkZWNvZGUuYnl0ZXMoKSwgZGVjb2RlLm5leHQoKSlcbiAgfVxuXG4gIGRlY29kZS5wb3NpdGlvbisrXG5cbiAgcmV0dXJuIGRpY3RcblxufVxuXG5kZWNvZGUubGlzdCA9IGZ1bmN0aW9uKCkge1xuXG4gIGRlY29kZS5wb3NpdGlvbisrXG5cbiAgdmFyIGxzdCA9IFtdXG5cbiAgd2hpbGUoIGRlY29kZS5kYXRhW2RlY29kZS5wb3NpdGlvbl0gIT09IDB4NjUgKSB7XG4gICAgbHN0LnB1c2goIGRlY29kZS5uZXh0KCkgKVxuICB9XG5cbiAgZGVjb2RlLnBvc2l0aW9uKytcblxuICByZXR1cm4gbHN0XG5cbn1cblxuZGVjb2RlLmludGVnZXIgPSBmdW5jdGlvbigpIHtcblxuICB2YXIgZW5kICAgID0gZGVjb2RlLmZpbmQoIDB4NjUgKVxuICB2YXIgbnVtYmVyID0gZGVjb2RlLmRhdGEudG9TdHJpbmcoICdhc2NpaScsIGRlY29kZS5wb3NpdGlvbiArIDEsIGVuZCApXG5cbiAgZGVjb2RlLnBvc2l0aW9uICs9IGVuZCArIDEgLSBkZWNvZGUucG9zaXRpb25cblxuICByZXR1cm4gcGFyc2VJbnQoIG51bWJlciwgMTAgKVxuXG59XG5cbmRlY29kZS5ieXRlcyA9IGZ1bmN0aW9uKCkge1xuXG4gIHZhciBzZXAgICAgPSBkZWNvZGUuZmluZCggMHgzQSApXG4gIHZhciBsZW5ndGggPSBwYXJzZUludCggZGVjb2RlLmRhdGEudG9TdHJpbmcoICdhc2NpaScsIGRlY29kZS5wb3NpdGlvbiwgc2VwICksIDEwIClcbiAgdmFyIGVuZCAgICA9ICsrc2VwICsgbGVuZ3RoXG5cbiAgZGVjb2RlLnBvc2l0aW9uID0gZW5kXG5cbiAgcmV0dXJuIGRlY29kZS5lbmNvZGluZ1xuICAgID8gZGVjb2RlLmRhdGEudG9TdHJpbmcoIGRlY29kZS5lbmNvZGluZywgc2VwLCBlbmQgKVxuICAgIDogZGVjb2RlLmRhdGEuc2xpY2UoIHNlcCwgZW5kIClcblxufVxuXG4vLyBFeHBvcnRzXG5tb2R1bGUuZXhwb3J0cyA9IGRlY29kZVxuIiwiLyoqXG4gKiBFbmNvZGVzIGRhdGEgaW4gYmVuY29kZS5cbiAqXG4gKiBAcGFyYW0gIHtCdWZmZXJ8QXJyYXl8U3RyaW5nfE9iamVjdHxOdW1iZXJ9IGRhdGFcbiAqIEByZXR1cm4ge0J1ZmZlcn1cbiAqL1xuZnVuY3Rpb24gZW5jb2RlKCBkYXRhICkge1xuICB2YXIgYnVmZmVycyA9IFtdXG4gIGVuY29kZS5fZW5jb2RlKCBidWZmZXJzLCBkYXRhIClcbiAgcmV0dXJuIEJ1ZmZlci5jb25jYXQoIGJ1ZmZlcnMgKVxufVxuXG5lbmNvZGUuX2Zsb2F0Q29udmVyc2lvbkRldGVjdGVkID0gZmFsc2VcblxuZW5jb2RlLl9lbmNvZGUgPSBmdW5jdGlvbiggYnVmZmVycywgZGF0YSApIHtcblxuICBpZiggQnVmZmVyLmlzQnVmZmVyKGRhdGEpICkge1xuICAgIGJ1ZmZlcnMucHVzaChuZXcgQnVmZmVyKGRhdGEubGVuZ3RoICsgJzonKSlcbiAgICBidWZmZXJzLnB1c2goZGF0YSlcbiAgICByZXR1cm47XG4gIH1cblxuICBzd2l0Y2goIHR5cGVvZiBkYXRhICkge1xuICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgICBlbmNvZGUuYnl0ZXMoIGJ1ZmZlcnMsIGRhdGEgKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICdudW1iZXInOlxuICAgICAgZW5jb2RlLm51bWJlciggYnVmZmVycywgZGF0YSApXG4gICAgICBicmVha1xuICAgIGNhc2UgJ29iamVjdCc6XG4gICAgICBkYXRhLmNvbnN0cnVjdG9yID09PSBBcnJheVxuICAgICAgICA/IGVuY29kZS5saXN0KCBidWZmZXJzLCBkYXRhIClcbiAgICAgICAgOiBlbmNvZGUuZGljdCggYnVmZmVycywgZGF0YSApXG4gICAgICBicmVha1xuICB9XG5cbn1cblxudmFyIGJ1ZmZfZSA9IG5ldyBCdWZmZXIoJ2UnKVxuICAsIGJ1ZmZfZCA9IG5ldyBCdWZmZXIoJ2QnKVxuICAsIGJ1ZmZfbCA9IG5ldyBCdWZmZXIoJ2wnKVxuXG5lbmNvZGUuYnl0ZXMgPSBmdW5jdGlvbiggYnVmZmVycywgZGF0YSApIHtcblxuICBidWZmZXJzLnB1c2goIG5ldyBCdWZmZXIoQnVmZmVyLmJ5dGVMZW5ndGgoIGRhdGEgKSArICc6JyArIGRhdGEpIClcbn1cblxuZW5jb2RlLm51bWJlciA9IGZ1bmN0aW9uKCBidWZmZXJzLCBkYXRhICkge1xuICB2YXIgbWF4TG8gPSAweDgwMDAwMDAwXG4gIHZhciBoaSA9ICggZGF0YSAvIG1heExvICkgPDwgMFxuICB2YXIgbG8gPSAoIGRhdGEgJSBtYXhMbyAgKSA8PCAwXG4gIHZhciB2YWwgPSBoaSAqIG1heExvICsgbG9cblxuICBidWZmZXJzLnB1c2goIG5ldyBCdWZmZXIoICdpJyArIHZhbCArICdlJyApKVxuXG4gIGlmKCB2YWwgIT09IGRhdGEgJiYgIWVuY29kZS5fZmxvYXRDb252ZXJzaW9uRGV0ZWN0ZWQgKSB7XG4gICAgZW5jb2RlLl9mbG9hdENvbnZlcnNpb25EZXRlY3RlZCA9IHRydWVcbiAgICBjb25zb2xlLndhcm4oXG4gICAgICAnV0FSTklORzogUG9zc2libGUgZGF0YSBjb3JydXB0aW9uIGRldGVjdGVkIHdpdGggdmFsdWUgXCInK2RhdGErJ1wiOicsXG4gICAgICAnQmVuY29kaW5nIG9ubHkgZGVmaW5lcyBzdXBwb3J0IGZvciBpbnRlZ2VycywgdmFsdWUgd2FzIGNvbnZlcnRlZCB0byBcIicrdmFsKydcIidcbiAgICApXG4gICAgY29uc29sZS50cmFjZSgpXG4gIH1cblxufVxuXG5lbmNvZGUuZGljdCA9IGZ1bmN0aW9uKCBidWZmZXJzLCBkYXRhICkge1xuXG4gIGJ1ZmZlcnMucHVzaCggYnVmZl9kIClcblxuICB2YXIgaiA9IDBcbiAgdmFyIGtcbiAgLy8gZml4IGZvciBpc3N1ZSAjMTMgLSBzb3J0ZWQgZGljdHNcbiAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyggZGF0YSApLnNvcnQoKVxuICB2YXIga2wgPSBrZXlzLmxlbmd0aFxuXG4gIGZvciggOyBqIDwga2wgOyBqKyspIHtcbiAgICBrPWtleXNbal1cbiAgICBlbmNvZGUuYnl0ZXMoIGJ1ZmZlcnMsIGsgKVxuICAgIGVuY29kZS5fZW5jb2RlKCBidWZmZXJzLCBkYXRhW2tdIClcbiAgfVxuXG4gIGJ1ZmZlcnMucHVzaCggYnVmZl9lIClcbn1cblxuZW5jb2RlLmxpc3QgPSBmdW5jdGlvbiggYnVmZmVycywgZGF0YSApIHtcblxuICB2YXIgaSA9IDAsIGogPSAxXG4gIHZhciBjID0gZGF0YS5sZW5ndGhcbiAgYnVmZmVycy5wdXNoKCBidWZmX2wgKVxuXG4gIGZvciggOyBpIDwgYzsgaSsrICkge1xuICAgIGVuY29kZS5fZW5jb2RlKCBidWZmZXJzLCBkYXRhW2ldIClcbiAgfVxuXG4gIGJ1ZmZlcnMucHVzaCggYnVmZl9lIClcblxufVxuXG4vLyBFeHBvc2Vcbm1vZHVsZS5leHBvcnRzID0gZW5jb2RlXG4iLCIvLyBUT0RPOiBkb24ndCByZXR1cm4gb2ZmZXIgd2hlbiB3ZSdyZSBhdCBjYXBhY2l0eS4gdGhlIGFwcHJvYWNoIG9mIG5vdCBzZW5kaW5nIGhhbmRzaGFrZVxuLy8gICAgICAgd2FzdGVzIHdlYnJ0YyBjb25uZWN0aW9ucyB3aGljaCBhcmUgYSBtb3JlIGxpbWl0ZWQgcmVzb3VyY2VcblxubW9kdWxlLmV4cG9ydHMgPSBTd2FybVxuXG52YXIgZGVidWcgPSByZXF1aXJlKCdkZWJ1ZycpKCd3ZWJ0b3JyZW50LXN3YXJtJylcbnZhciBFdmVudEVtaXR0ZXIgPSByZXF1aXJlKCdldmVudHMnKS5FdmVudEVtaXR0ZXJcbnZhciBpbmhlcml0cyA9IHJlcXVpcmUoJ2luaGVyaXRzJylcbnZhciBvbmNlID0gcmVxdWlyZSgnb25jZScpXG52YXIgc3BlZWRvbWV0ZXIgPSByZXF1aXJlKCdzcGVlZG9tZXRlcicpXG52YXIgV2lyZSA9IHJlcXVpcmUoJ2JpdHRvcnJlbnQtcHJvdG9jb2wnKVxuXG52YXIgTUFYX1BFRVJTID0gMzBcbnZhciBIQU5EU0hBS0VfVElNRU9VVCA9IDI1MDAwXG5cbi8qKlxuICogUGVlclxuICogQSBwZWVyIGluIHRoZSBzd2FybS4gQ29tcHJpc2VkIG9mIGEgYFNpbXBsZVBlZXJgIGFuZCBhIGBXaXJlYC5cbiAqXG4gKiBAcGFyYW0ge1N3YXJtfSBzd2FybVxuICogQHBhcmFtIHtzdHJlYW0uRHVwbGV4fSBzdHJlYW0gYSBkdXBsZXggc3RyZWFtIHRvIHRoZSByZW1vdGUgcGVlclxuICogQHBhcmFtIHtzdHJpbmd9IGlkIHJlbW90ZSBwZWVySWRcbiAqL1xuZnVuY3Rpb24gUGVlciAoc3dhcm0sIHN0cmVhbSwgaWQpIHtcbiAgdGhpcy5zd2FybSA9IHN3YXJtXG4gIHRoaXMuc3RyZWFtID0gc3RyZWFtXG4gIHRoaXMuaWQgPSBpZFxuXG4gIHZhciB3aXJlID0gdGhpcy53aXJlID0gbmV3IFdpcmUoKVxuICB0aGlzLnRpbWVvdXQgPSBudWxsXG4gIHRoaXMuaGFuZHNoYWtlZCA9IGZhbHNlXG4gIHRoaXMucGF1c2VkID0gdHJ1ZVxuXG4gIHZhciBkZXN0cm95ID0gb25jZShmdW5jdGlvbiAoKSB7XG4gICAgaWYgKHRoaXMuaGFuZHNoYWtlZClcbiAgICAgIHRoaXMuc3dhcm0ud2lyZXMuc3BsaWNlKHRoaXMuc3dhcm0ud2lyZXMuaW5kZXhPZih0aGlzLndpcmUpLCAxKVxuICAgIHRoaXMuZGVzdHJveSgpXG4gICAgdGhpcy5zd2FybS5fZHJhaW4oKVxuICAgIHRoaXMuc3dhcm0uX3BlZXJzW3RoaXMuaWRdID0gbnVsbFxuICB9LmJpbmQodGhpcykpXG5cbiAgLy8gRGVzdHJveSB0aGUgcGVlciB3aGVuIHRoZSBzdHJlYW0vd2lyZSBpcyBkb25lIG9yIGVtaXRzIGFuIGVycm9yLlxuICBzdHJlYW0ub25jZSgnZW5kJywgZGVzdHJveSlcbiAgc3RyZWFtLm9uY2UoJ2Vycm9yJywgZGVzdHJveSlcbiAgc3RyZWFtLm9uY2UoJ2Nsb3NlJywgZGVzdHJveSlcbiAgc3RyZWFtLm9uY2UoJ2ZpbmlzaCcsIGRlc3Ryb3kpXG5cbiAgd2lyZS5vbmNlKCdlbmQnLCBkZXN0cm95KVxuICB3aXJlLm9uY2UoJ2Nsb3NlJywgZGVzdHJveSlcbiAgd2lyZS5vbmNlKCdlcnJvcicsIGRlc3Ryb3kpXG4gIHdpcmUub25jZSgnZmluaXNoJywgZGVzdHJveSlcblxuICB3aXJlLm9uKCdoYW5kc2hha2UnLCB0aGlzLl9vbkhhbmRzaGFrZS5iaW5kKHRoaXMpKVxuXG4gIC8vIER1cGxleCBzdHJlYW1pbmcgbWFnaWMhXG4gIHN0cmVhbS5waXBlKHdpcmUpLnBpcGUoc3RyZWFtKVxufVxuXG5QZWVyLnByb3RvdHlwZS5kZXN0cm95ID0gZnVuY3Rpb24gKCkge1xuICBkZWJ1ZygncGVlciBkZXN0cm95JylcbiAgaWYgKHRoaXMuc3RyZWFtKSB0aGlzLnN0cmVhbS5kZXN0cm95KClcbiAgaWYgKHRoaXMud2lyZSkgdGhpcy53aXJlLmRlc3Ryb3koKVxuICBpZiAodGhpcy50aW1lb3V0KSBjbGVhclRpbWVvdXQodGhpcy50aW1lb3V0KVxuICB0aGlzLnN0cmVhbSA9IG51bGxcbiAgdGhpcy53aXJlID0gbnVsbFxuICB0aGlzLnRpbWVvdXQgPSBudWxsXG59XG5cbi8qKlxuICogU2VuZCBhIGhhbmRzaGFrZSB0byB0aGUgcmVtb3RlIHBlZXIuIFRoaXMgaXMgY2FsbGVkIGJ5IF9kcmFpbigpIHdoZW4gdGhlcmUgaXMgcm9vbVxuICogZm9yIGEgbmV3IHBlZXIgaW4gdGhpcyBzd2FybS4gRXZlbiBpZiB0aGUgcmVtb3RlIHBlZXIgc2VuZHMgdXMgYSBoYW5kc2hha2UsIHdlIG1pZ2h0XG4gKiBub3Qgc2VuZCBhIHJldHVybiBoYW5kc2hha2UuIFRoaXMgaXMgaG93IHdlIHJhdGUtbGltaXQgd2hlbiB0aGVyZSBhcmUgdG9vIG1hbnkgcGVlcnM7XG4gKiB3aXRob3V0IGEgcmV0dXJuIGhhbmRzaGFrZSB0aGUgcmVtb3RlIHBlZXIgd29uJ3Qgc3RhcnQgc2VuZGluZyB1cyBkYXRhIG9yIHBpZWNlXG4gKiByZXF1ZXN0cy5cbiAqL1xuUGVlci5wcm90b3R5cGUuaGFuZHNoYWtlID0gZnVuY3Rpb24gKCkge1xuICB0aGlzLnBhdXNlZCA9IGZhbHNlXG4gIHRoaXMud2lyZS5oYW5kc2hha2UodGhpcy5zd2FybS5pbmZvSGFzaCwgdGhpcy5zd2FybS5wZWVySWQsIHRoaXMuc3dhcm0uaGFuZHNoYWtlKVxuICBkZWJ1Zygnc2VudCBoYW5kc2hha2UgaSAlcyBwICVzJywgdGhpcy5zd2FybS5pbmZvSGFzaEhleCwgdGhpcy5zd2FybS5wZWVySWRIZXgpXG5cbiAgaWYgKCF0aGlzLmhhbmRzaGFrZWQpIHtcbiAgICAvLyBQZWVyIG11c3QgcmVzcG9uZCB0byBoYW5kc2hha2UgaW4gdGltZWx5IG1hbm5lclxuICAgIHRoaXMudGltZW91dCA9IHNldFRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgICAgdGhpcy5kZXN0cm95KClcbiAgICB9LmJpbmQodGhpcyksIEhBTkRTSEFLRV9USU1FT1VUKVxuICB9XG59XG5cbi8qKlxuICogQ2FsbGVkIHdoZW5ldmVyIHdlJ3ZlIGhhbmRzaGFrZW4gd2l0aCBhIG5ldyB3aXJlLlxuICogQHBhcmFtICB7c3RyaW5nfSBpbmZvSGFzaFxuICovXG5QZWVyLnByb3RvdHlwZS5fb25IYW5kc2hha2UgPSBmdW5jdGlvbiAoaW5mb0hhc2gpIHtcbiAgdmFyIGluZm9IYXNoSGV4ID0gaW5mb0hhc2gudG9TdHJpbmcoJ2hleCcpXG4gIGRlYnVnKCdnb3QgaGFuZHNoYWtlICVzJywgaW5mb0hhc2hIZXgpXG5cbiAgaWYgKHRoaXMuc3dhcm0uZGVzdHJveWVkIHx8IGluZm9IYXNoSGV4ICE9PSB0aGlzLnN3YXJtLmluZm9IYXNoSGV4KVxuICAgIHJldHVybiB0aGlzLmRlc3Ryb3koKVxuXG4gIHRoaXMuaGFuZHNoYWtlZCA9IHRydWVcbiAgY2xlYXJUaW1lb3V0KHRoaXMudGltZW91dClcblxuICAvLyBUcmFjayB0b3RhbCBieXRlcyBkb3dubG9hZGVkIGJ5IHRoZSBzd2FybVxuICB0aGlzLndpcmUub24oJ2Rvd25sb2FkJywgZnVuY3Rpb24gKGRvd25sb2FkZWQpIHtcbiAgICB0aGlzLnN3YXJtLmRvd25sb2FkZWQgKz0gZG93bmxvYWRlZFxuICAgIHRoaXMuc3dhcm0uZG93bmxvYWRTcGVlZChkb3dubG9hZGVkKVxuICAgIHRoaXMuc3dhcm0uZW1pdCgnZG93bmxvYWQnLCBkb3dubG9hZGVkKVxuICB9LmJpbmQodGhpcykpXG5cbiAgLy8gVHJhY2sgdG90YWwgYnl0ZXMgdXBsb2FkZWQgYnkgdGhlIHN3YXJtXG4gIHRoaXMud2lyZS5vbigndXBsb2FkJywgZnVuY3Rpb24gKHVwbG9hZGVkKSB7XG4gICAgdGhpcy5zd2FybS51cGxvYWRlZCArPSB1cGxvYWRlZFxuICAgIHRoaXMuc3dhcm0udXBsb2FkU3BlZWQodXBsb2FkZWQpXG4gICAgdGhpcy5zd2FybS5lbWl0KCd1cGxvYWQnLCB1cGxvYWRlZClcbiAgfS5iaW5kKHRoaXMpKVxuXG4gIHRoaXMuc3dhcm0ud2lyZXMucHVzaCh0aGlzLndpcmUpXG4gIHRoaXMuc3dhcm0uZW1pdCgnd2lyZScsIHRoaXMud2lyZSlcbn1cblxuaW5oZXJpdHMoU3dhcm0sIEV2ZW50RW1pdHRlcilcblxuLyoqXG4gKiBTd2FybVxuICogPT09PT1cbiAqIEFic3RyYWN0aW9uIG9mIGEgQml0VG9ycmVudCBcInN3YXJtXCIsIHdoaWNoIGlzIGhhbmR5IGZvciBtYW5hZ2luZyBhbGwgcGVlclxuICogY29ubmVjdGlvbnMgZm9yIGEgZ2l2ZW4gdG9ycmVudCBkb3dubG9hZC4gVGhpcyBoYW5kbGVzIGNvbm5lY3RpbmcgdG8gcGVlcnMsXG4gKiBsaXN0ZW5pbmcgZm9yIGluY29taW5nIGNvbm5lY3Rpb25zLCBhbmQgZG9pbmcgdGhlIGluaXRpYWwgcGVlciB3aXJlIHByb3RvY29sXG4gKiBoYW5kc2hha2Ugd2l0aCBwZWVycy4gSXQgYWxzbyB0cmFja3MgdG90YWwgZGF0YSB1cGxvYWRlZC9kb3dubG9hZGVkIHRvL2Zyb21cbiAqIHRoZSBzd2FybS5cbiAqXG4gKiBFdmVudHM6IHdpcmUsIGRvd25sb2FkLCB1cGxvYWQsIGVycm9yLCBjbG9zZVxuICpcbiAqIEBwYXJhbSB7QnVmZmVyfHN0cmluZ30gaW5mb0hhc2hcbiAqIEBwYXJhbSB7QnVmZmVyfHN0cmluZ30gcGVlcklkXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0c1xuICovXG5mdW5jdGlvbiBTd2FybSAoaW5mb0hhc2gsIHBlZXJJZCwgb3B0cykge1xuICBpZiAoISh0aGlzIGluc3RhbmNlb2YgU3dhcm0pKSByZXR1cm4gbmV3IFN3YXJtKGluZm9IYXNoLCBwZWVySWQsIG9wdHMpXG4gIEV2ZW50RW1pdHRlci5jYWxsKHRoaXMpXG4gIGlmICghb3B0cykgb3B0cyA9IHt9XG5cbiAgdGhpcy5pbmZvSGFzaCA9IHR5cGVvZiBpbmZvSGFzaCA9PT0gJ3N0cmluZydcbiAgICA/IG5ldyBCdWZmZXIoaW5mb0hhc2gsICdoZXgnKVxuICAgIDogaW5mb0hhc2hcbiAgdGhpcy5pbmZvSGFzaEhleCA9IHRoaXMuaW5mb0hhc2gudG9TdHJpbmcoJ2hleCcpXG5cbiAgdGhpcy5wZWVySWQgPSB0eXBlb2YgcGVlcklkID09PSAnc3RyaW5nJ1xuICAgID8gbmV3IEJ1ZmZlcihwZWVySWQsICdoZXgnKVxuICAgIDogcGVlcklkXG4gIHRoaXMucGVlcklkSGV4ID0gdGhpcy5wZWVySWQudG9TdHJpbmcoJ2hleCcpXG5cbiAgZGVidWcoJ25ldyBzd2FybSBpICVzIHAgJXMnLCB0aGlzLmluZm9IYXNoSGV4LCB0aGlzLnBlZXJJZEhleClcblxuICB0aGlzLmhhbmRzaGFrZSA9IG9wdHMuaGFuZHNoYWtlIC8vIGhhbmRzaGFrZSBleHRlbnNpb25zXG4gIHRoaXMubWF4UGVlcnMgPSBvcHRzLm1heFBlZXJzIHx8IE1BWF9QRUVSU1xuXG4gIHRoaXMuZG93bmxvYWRlZCA9IDBcbiAgdGhpcy51cGxvYWRlZCA9IDBcbiAgdGhpcy5kb3dubG9hZFNwZWVkID0gc3BlZWRvbWV0ZXIoKVxuICB0aGlzLnVwbG9hZFNwZWVkID0gc3BlZWRvbWV0ZXIoKVxuXG4gIHRoaXMud2lyZXMgPSBbXSAvLyBvcGVuIHdpcmVzIChhZGRlZCAqYWZ0ZXIqIGhhbmRzaGFrZSlcbiAgdGhpcy5fcXVldWUgPSBbXSAvLyBxdWV1ZSBvZiBwZWVycyB0byBhdHRlbXB0IGhhbmRzaGFrZSB3aXRoXG4gIHRoaXMuX3BlZXJzID0ge30gLy8gY29ubmVjdGVkIHBlZXJzIChwZWVySWQgLT4gUGVlcilcblxuICB0aGlzLnBhdXNlZCA9IGZhbHNlXG4gIHRoaXMuZGVzdHJveWVkID0gZmFsc2Vcbn1cblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KFN3YXJtLnByb3RvdHlwZSwgJ3JhdGlvJywge1xuICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICBpZiAodGhpcy5kb3dubG9hZGVkID09PSAwKVxuICAgICAgcmV0dXJuIDBcbiAgICBlbHNlXG4gICAgICByZXR1cm4gdGhpcy51cGxvYWRlZCAvIHRoaXMuZG93bmxvYWRlZFxuICB9XG59KVxuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoU3dhcm0ucHJvdG90eXBlLCAnbnVtUXVldWVkJywge1xuICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdGhpcy5fcXVldWUubGVuZ3RoXG4gIH1cbn0pXG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShTd2FybS5wcm90b3R5cGUsICdudW1QZWVycycsIHtcbiAgZ2V0OiBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIHRoaXMud2lyZXMubGVuZ3RoXG4gIH1cbn0pXG5cbi8qKlxuICogQWRkIGEgcGVlciB0byB0aGUgc3dhcm0uXG4gKiBAcGFyYW0ge1NpbXBsZVBlZXJ9IHNpbXBsZVBlZXIgICAgIHNpbXBsZSBwZWVyIGluc3RhbmNlIHRvIHJlbW90ZSBwZWVyXG4gKiBAcGFyYW0ge3N0cmluZ30gICAgIHNpbXBsZVBlZXIuaWQgIHBlZXIgaWRcbiAqL1xuU3dhcm0ucHJvdG90eXBlLmFkZFBlZXIgPSBmdW5jdGlvbiAoc2ltcGxlUGVlcikge1xuICBpZiAodGhpcy5kZXN0cm95ZWQpIHJldHVyblxuICBpZiAodGhpcy5fcGVlcnNbc2ltcGxlUGVlci5pZF0pIHJldHVyblxuICB2YXIgc3RyZWFtID0gc2ltcGxlUGVlci5nZXREYXRhU3RyZWFtKClcbiAgdmFyIHBlZXIgPSBuZXcgUGVlcih0aGlzLCBzdHJlYW0sIHNpbXBsZVBlZXIuaWQpXG4gIHRoaXMuX3BlZXJzW3NpbXBsZVBlZXIuaWRdID0gcGVlclxuICB0aGlzLl9xdWV1ZS5wdXNoKHBlZXIpXG4gIHRoaXMuX2RyYWluKClcbn1cblxuLyoqXG4gKiBUZW1wb3JhcmlseSBzdG9wIGNvbm5lY3RpbmcgdG8gbmV3IHBlZXJzLiBOb3RlIHRoYXQgdGhpcyBkb2VzIG5vdCBwYXVzZSBuZXdcbiAqIGluY29taW5nIGNvbm5lY3Rpb25zLCBub3IgZG9lcyBpdCBwYXVzZSB0aGUgc3RyZWFtcyBvZiBleGlzdGluZyBjb25uZWN0aW9uc1xuICogb3IgdGhlaXIgd2lyZXMuXG4gKi9cblN3YXJtLnByb3RvdHlwZS5wYXVzZSA9IGZ1bmN0aW9uICgpIHtcbiAgZGVidWcoJ3BhdXNlJylcbiAgdGhpcy5wYXVzZWQgPSB0cnVlXG59XG5cbi8qKlxuICogUmVzdW1lIGNvbm5lY3RpbmcgdG8gbmV3IHBlZXJzLlxuICovXG5Td2FybS5wcm90b3R5cGUucmVzdW1lID0gZnVuY3Rpb24gKCkge1xuICBkZWJ1ZygncmVzdW1lJylcbiAgdGhpcy5wYXVzZWQgPSBmYWxzZVxuICB0aGlzLl9kcmFpbigpXG59XG5cbi8qKlxuICogUmVtb3ZlIGEgcGVlciBmcm9tIHRoZSBzd2FybS5cbiAqIEBwYXJhbSAge3N0cmluZ30gcGVlciAgc2ltcGxlLXBlZXIgaW5zdGFuY2VcbiAqL1xuU3dhcm0ucHJvdG90eXBlLnJlbW92ZVBlZXIgPSBmdW5jdGlvbiAocGVlcikge1xuICBkZWJ1ZygncmVtb3ZlUGVlciAlcycsIHBlZXIpXG4gIHRoaXMuX3JlbW92ZVBlZXIocGVlcilcbiAgdGhpcy5fZHJhaW4oKVxufVxuXG4vKipcbiAqIFByaXZhdGUgbWV0aG9kIHRvIHJlbW92ZSBhIHBlZXIgZnJvbSB0aGUgc3dhcm0gd2l0aG91dCBjYWxsaW5nIF9kcmFpbigpLlxuICogQHBhcmFtICB7c3RyaW5nfSBwZWVyICBzaW1wbGUtcGVlciBpbnN0YW5jZVxuICovXG5Td2FybS5wcm90b3R5cGUuX3JlbW92ZVBlZXIgPSBmdW5jdGlvbiAocGVlcikge1xuICBkZWJ1ZygnX3JlbW92ZVBlZXIgJXMnLCBwZWVyKVxuICBwZWVyLmRlc3Ryb3koKVxufVxuXG4vKipcbiAqIERlc3Ryb3kgdGhlIHN3YXJtLCBjbG9zZSBhbGwgb3BlbiBwZWVyIGNvbm5lY3Rpb25zLCBhbmQgZG8gY2xlYW51cC5cbiAqIEBwYXJhbSB7ZnVuY3Rpb259IG9uY2xvc2VcbiAqL1xuU3dhcm0ucHJvdG90eXBlLmRlc3Ryb3kgPSBmdW5jdGlvbiAob25jbG9zZSkge1xuICBpZiAodGhpcy5kZXN0cm95ZWQpIHJldHVyblxuICB0aGlzLmRlc3Ryb3llZCA9IHRydWVcbiAgaWYgKG9uY2xvc2UpIHRoaXMub25jZSgnY2xvc2UnLCBvbmNsb3NlKVxuXG4gIGRlYnVnKCdkZXN0cm95JylcblxuICBmb3IgKHZhciBwZWVyIGluIHRoaXMuX3BlZXJzKSB7XG4gICAgdGhpcy5fcmVtb3ZlUGVlcihwZWVyKVxuICB9XG5cbiAgdGhpcy5lbWl0KCdjbG9zZScpXG59XG5cbi8qKlxuICogUG9wIGEgcGVlciBvZmYgdGhlIEZJRk8gcXVldWUgYW5kIGNvbm5lY3QgdG8gaXQuIFdoZW4gX2RyYWluKCkgZ2V0cyBjYWxsZWQsXG4gKiB0aGUgcXVldWUgd2lsbCB1c3VhbGx5IGhhdmUgb25seSBvbmUgcGVlciBpbiBpdCwgZXhjZXB0IHdoZW4gdGhlcmUgYXJlIHRvb1xuICogbWFueSBwZWVycyAob3ZlciBgdGhpcy5tYXhQZWVyc2ApIGluIHdoaWNoIGNhc2UgdGhleSB3aWxsIGp1c3Qgc2l0IGluIHRoZVxuICogcXVldWUgdW50aWwgYW5vdGhlciBjb25uZWN0aW9uIGNsb3Nlcy5cbiAqL1xuU3dhcm0ucHJvdG90eXBlLl9kcmFpbiA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMucGF1c2VkIHx8IHRoaXMuZGVzdHJveWVkIHx8IHRoaXMubnVtUGVlcnMgPj0gdGhpcy5tYXhQZWVycykgcmV0dXJuXG4gIGRlYnVnKCdkcmFpbiAlcyBxdWV1ZWQgJXMgcGVlcnMgJXMgbWF4JywgdGhpcy5udW1RdWV1ZWQsIHRoaXMubnVtUGVlcnMsIHRoaXMubWF4UGVlcnMpXG4gIHZhciBwZWVyID0gdGhpcy5fcXVldWUuc2hpZnQoKVxuICBpZiAocGVlcikge1xuICAgIHBlZXIuaGFuZHNoYWtlKClcbiAgfVxufVxuIiwibW9kdWxlLmV4cG9ydHMgPSBXaXJlXG5cbnZhciBCaXRGaWVsZCA9IHJlcXVpcmUoJ2JpdGZpZWxkJylcbnZhciBiZW5jb2RlID0gcmVxdWlyZSgnYmVuY29kZScpXG52YXIgZGVidWcgPSByZXF1aXJlKCdkZWJ1ZycpKCdiaXR0b3JyZW50LXByb3RvY29sJylcbnZhciBleHRlbmQgPSByZXF1aXJlKCd4dGVuZCcpXG52YXIgaW5oZXJpdHMgPSByZXF1aXJlKCdpbmhlcml0cycpXG52YXIgc3BlZWRvbWV0ZXIgPSByZXF1aXJlKCdzcGVlZG9tZXRlcicpXG52YXIgc3RyZWFtID0gcmVxdWlyZSgnc3RyZWFtJylcblxudmFyIEJJVEZJRUxEX0dST1cgPSA0MDAwMDBcblxudmFyIE1FU1NBR0VfUFJPVE9DT0wgPSBuZXcgQnVmZmVyKCdcXHUwMDEzQml0VG9ycmVudCBwcm90b2NvbCcpXG52YXIgTUVTU0FHRV9LRUVQX0FMSVZFID0gbmV3IEJ1ZmZlcihbMHgwMCwgMHgwMCwgMHgwMCwgMHgwMF0pXG52YXIgTUVTU0FHRV9DSE9LRSA9IG5ldyBCdWZmZXIoWzB4MDAsIDB4MDAsIDB4MDAsIDB4MDEsIDB4MDBdKVxudmFyIE1FU1NBR0VfVU5DSE9LRSA9IG5ldyBCdWZmZXIoWzB4MDAsIDB4MDAsIDB4MDAsIDB4MDEsIDB4MDFdKVxudmFyIE1FU1NBR0VfSU5URVJFU1RFRCA9IG5ldyBCdWZmZXIoWzB4MDAsIDB4MDAsIDB4MDAsIDB4MDEsIDB4MDJdKVxudmFyIE1FU1NBR0VfVU5JTlRFUkVTVEVEID0gbmV3IEJ1ZmZlcihbMHgwMCwgMHgwMCwgMHgwMCwgMHgwMSwgMHgwM10pXG5cbnZhciBNRVNTQUdFX1JFU0VSVkVEID0gWzB4MDAsIDB4MDAsIDB4MDAsIDB4MDAsIDB4MDAsIDB4MDAsIDB4MDAsIDB4MDBdXG52YXIgTUVTU0FHRV9QT1JUID0gWzB4MDAsIDB4MDAsIDB4MDAsIDB4MDMsIDB4MDksIDB4MDAsIDB4MDBdXG5cbmZ1bmN0aW9uIFJlcXVlc3QgKHBpZWNlLCBvZmZzZXQsIGxlbmd0aCwgY2FsbGJhY2spIHtcbiAgdGhpcy5waWVjZSA9IHBpZWNlXG4gIHRoaXMub2Zmc2V0ID0gb2Zmc2V0XG4gIHRoaXMubGVuZ3RoID0gbGVuZ3RoXG4gIHRoaXMuY2FsbGJhY2sgPSBjYWxsYmFja1xufVxuXG5pbmhlcml0cyhXaXJlLCBzdHJlYW0uRHVwbGV4KVxuXG5mdW5jdGlvbiBXaXJlICgpIHtcbiAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIFdpcmUpKSByZXR1cm4gbmV3IFdpcmUoKVxuICBzdHJlYW0uRHVwbGV4LmNhbGwodGhpcylcbiAgZGVidWcoJ25ldyB3aXJlJylcblxuICB0aGlzLmFtQ2hva2luZyA9IHRydWUgLy8gYXJlIHdlIGNob2tpbmcgdGhlIHBlZXI/XG4gIHRoaXMuYW1JbnRlcmVzdGVkID0gZmFsc2UgLy8gYXJlIHdlIGludGVyZXN0ZWQgaW4gdGhlIHBlZXI/XG5cbiAgdGhpcy5wZWVyQ2hva2luZyA9IHRydWUgLy8gaXMgdGhlIHBlZXIgY2hva2luZyB1cz9cbiAgdGhpcy5wZWVySW50ZXJlc3RlZCA9IGZhbHNlIC8vIGlzIHRoZSBwZWVyIGludGVyZXN0ZWQgaW4gdXM/XG5cbiAgLy8gVGhlIGxhcmdlc3QgdG9ycmVudCB0aGF0IEkga25vdyBvZiAodGhlIEdlb2NpdGllcyBhcmNoaXZlKSBpcyB+NjQxIEdCIGFuZCBoYXNcbiAgLy8gfjQxLDAwMCBwaWVjZXMuIFRoZXJlZm9yZSwgY2FwIGJpdGZpZWxkIHRvIDEweCBsYXJnZXIgKDQwMCwwMDAgYml0cykgdG8gc3VwcG9ydCBhbGxcbiAgLy8gcG9zc2libGUgdG9ycmVudHMgYnV0IHByZXZlbnQgbWFsaWNpb3VzIHBlZXJzIGZyb20gZ3Jvd2luZyBiaXRmaWVsZCB0byBmaWxsIG1lbW9yeS5cbiAgdGhpcy5wZWVyUGllY2VzID0gbmV3IEJpdEZpZWxkKDAsIHsgZ3JvdzogQklURklFTERfR1JPVyB9KVxuXG4gIHRoaXMucGVlckV4dGVuc2lvbnMgPSB7fVxuXG4gIC8vIG91dGdvaW5nXG4gIHRoaXMucmVxdWVzdHMgPSBbXVxuICAvLyBpbmNvbWluZ1xuICB0aGlzLnBlZXJSZXF1ZXN0cyA9IFtdXG5cbiAgLyoqIEB0eXBlIHtPYmplY3R9IG51bWJlciAtPiBzdHJpbmcsIGV4OiAxIC0+ICd1dF9tZXRhZGF0YScgKi9cbiAgdGhpcy5leHRlbmRlZE1hcHBpbmcgPSB7fVxuICAvKiogQHR5cGUge09iamVjdH0gc3RyaW5nIC0+IG51bWJlciwgZXg6IDkgLT4gJ3V0X21ldGFkYXRhJyAqL1xuICB0aGlzLnBlZXJFeHRlbmRlZE1hcHBpbmcgPSB7fVxuXG4gIC8qKlxuICAgKiBUaGUgZXh0ZW5kZWQgaGFuZHNoYWtlIHRvIHNlbmQsIG1pbnVzIHRoZSBcIm1cIiBmaWVsZCwgd2hpY2ggZ2V0cyBhdXRvbWF0aWNhbGx5XG4gICAqIGZpbGxlZCBmcm9tIGB0aGlzLmV4dGVuZGVkTWFwcGluZ2AuXG4gICAqIEB0eXBlIHtPYmplY3R9XG4gICAqL1xuICB0aGlzLmV4dGVuZGVkSGFuZHNoYWtlID0ge31cbiAgdGhpcy5wZWVyRXh0ZW5kZWRIYW5kc2hha2UgPSB7fVxuXG4gIC8qKiBAdHlwZSB7T2JqZWN0fSBzdHJpbmcgLT4gZnVuY3Rpb24sIGV4ICd1dF9tZXRhZGF0YScgLT4gdXRfbWV0YWRhdGEoKSAqL1xuICB0aGlzLl9leHQgPSB7fVxuICB0aGlzLl9uZXh0RXh0ID0gMVxuXG4gIHRoaXMudXBsb2FkZWQgPSAwXG4gIHRoaXMuZG93bmxvYWRlZCA9IDBcbiAgdGhpcy51cGxvYWRTcGVlZCA9IHNwZWVkb21ldGVyKClcbiAgdGhpcy5kb3dubG9hZFNwZWVkID0gc3BlZWRvbWV0ZXIoKVxuXG4gIHRoaXMuX2tlZXBBbGl2ZSA9IG51bGxcbiAgdGhpcy5fdGltZW91dCA9IG51bGxcbiAgdGhpcy5fdGltZW91dE1zID0gMFxuXG4gIHRoaXMuZGVzdHJveWVkID0gZmFsc2UgLy8gd2FzIHRoZSB3aXJlIGVuZGVkIGJ5IGNhbGxpbmcgYGRlc3Ryb3lgP1xuICB0aGlzLl9maW5pc2hlZCA9IGZhbHNlXG5cbiAgdGhpcy5fYnVmZmVyID0gW11cbiAgdGhpcy5fYnVmZmVyU2l6ZSA9IDBcbiAgdGhpcy5fcGFyc2VyID0gbnVsbFxuICB0aGlzLl9wYXJzZXJTaXplID0gMFxuXG4gIHRoaXMub24oJ2ZpbmlzaCcsIHRoaXMuX29uZmluaXNoKVxuXG4gIHRoaXMuX3BhcnNlSGFuZHNoYWtlKClcbn1cblxuLyoqXG4gKiBTZXQgd2hldGhlciB0byBzZW5kIGEgXCJrZWVwLWFsaXZlXCIgcGluZyAoc2VudCBldmVyeSA2MHMpXG4gKiBAcGFyYW0ge2Jvb2xlYW59IGVuYWJsZVxuICovXG5XaXJlLnByb3RvdHlwZS5zZXRLZWVwQWxpdmUgPSBmdW5jdGlvbiAoZW5hYmxlKSB7XG4gIGNsZWFySW50ZXJ2YWwodGhpcy5fa2VlcEFsaXZlKVxuICBpZiAoZW5hYmxlID09PSBmYWxzZSkgcmV0dXJuXG4gIHRoaXMuX2tlZXBBbGl2ZSA9IHNldEludGVydmFsKHRoaXMuX3B1c2guYmluZCh0aGlzLCBNRVNTQUdFX0tFRVBfQUxJVkUpLCA2MDAwMClcbn1cblxuLyoqXG4gKiBTZXQgdGhlIGFtb3VudCBvZiB0aW1lIHRvIHdhaXQgYmVmb3JlIGNvbnNpZGVyaW5nIGEgcmVxdWVzdCB0byBiZSBcInRpbWVkIG91dFwiXG4gKiBAcGFyYW0ge251bWJlcn0gbXNcbiAqL1xuV2lyZS5wcm90b3R5cGUuc2V0VGltZW91dCA9IGZ1bmN0aW9uIChtcykge1xuICB0aGlzLl9jbGVhclRpbWVvdXQoKVxuICB0aGlzLl90aW1lb3V0TXMgPSBtc1xuICB0aGlzLl91cGRhdGVUaW1lb3V0KClcbn1cblxuV2lyZS5wcm90b3R5cGUuZGVzdHJveSA9IGZ1bmN0aW9uICgpIHtcbiAgdGhpcy5kZXN0cm95ZWQgPSB0cnVlXG4gIHRoaXMuZW5kKClcbn1cblxuV2lyZS5wcm90b3R5cGUuZW5kID0gZnVuY3Rpb24gKCkge1xuICB0aGlzLl9vblVuaW50ZXJlc3RlZCgpXG4gIHRoaXMuX29uQ2hva2UoKVxuICBzdHJlYW0uRHVwbGV4LnByb3RvdHlwZS5lbmQuYXBwbHkodGhpcywgYXJndW1lbnRzKVxufVxuXG4vL1xuLy8gUFJPVE9DT0wgRVhURU5TSU9OIEFQSVxuLy9cblxuV2lyZS5wcm90b3R5cGUudXNlID0gZnVuY3Rpb24gKEV4dGVuc2lvbikge1xuICB2YXIgbmFtZSA9IEV4dGVuc2lvbi5wcm90b3R5cGUubmFtZVxuICBpZiAoIW5hbWUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0V4dGVuc2lvbiBBUEkgcmVxdWlyZXMgYSBuYW1lZCBmdW5jdGlvbiwgZS5nLiBmdW5jdGlvbiBuYW1lKCkge30nKVxuICB9XG5cbiAgdmFyIGV4dCA9IHRoaXMuX25leHRFeHRcbiAgdmFyIGhhbmRsZXIgPSBuZXcgRXh0ZW5zaW9uKHRoaXMpXG5cbiAgZnVuY3Rpb24gbm9vcCAoKSB7fVxuXG4gIGlmICh0eXBlb2YgaGFuZGxlci5vbkhhbmRzaGFrZSAhPT0gJ2Z1bmN0aW9uJykge1xuICAgIGhhbmRsZXIub25IYW5kc2hha2UgPSBub29wXG4gIH1cbiAgaWYgKHR5cGVvZiBoYW5kbGVyLm9uRXh0ZW5kZWRIYW5kc2hha2UgIT09ICdmdW5jdGlvbicpIHtcbiAgICBoYW5kbGVyLm9uRXh0ZW5kZWRIYW5kc2hha2UgPSBub29wXG4gIH1cbiAgaWYgKHR5cGVvZiBoYW5kbGVyLm9uTWVzc2FnZSAhPT0gJ2Z1bmN0aW9uJykge1xuICAgIGhhbmRsZXIub25NZXNzYWdlID0gbm9vcFxuICB9XG5cbiAgdGhpcy5leHRlbmRlZE1hcHBpbmdbZXh0XSA9IG5hbWVcbiAgdGhpcy5fZXh0W25hbWVdID0gaGFuZGxlclxuICB0aGlzW25hbWVdID0gaGFuZGxlclxuXG4gIHRoaXMuX25leHRFeHQgKz0gMVxufVxuXG4vL1xuLy8gT1VUR09JTkcgTUVTU0FHRVNcbi8vXG5cbi8qKlxuICogTWVzc2FnZTogXCJoYW5kc2hha2VcIiA8cHN0cmxlbj48cHN0cj48cmVzZXJ2ZWQ+PGluZm9faGFzaD48cGVlcl9pZD5cbiAqIEBwYXJhbSAge0J1ZmZlcnxzdHJpbmd9IGluZm9IYXNoIChhcyBCdWZmZXIgb3IgKmhleCogc3RyaW5nKVxuICogQHBhcmFtICB7QnVmZmVyfHN0cmluZ30gcGVlcklkXG4gKiBAcGFyYW0gIHtPYmplY3R9IGV4dGVuc2lvbnNcbiAqL1xuV2lyZS5wcm90b3R5cGUuaGFuZHNoYWtlID0gZnVuY3Rpb24gKGluZm9IYXNoLCBwZWVySWQsIGV4dGVuc2lvbnMpIHtcbiAgaWYgKHR5cGVvZiBpbmZvSGFzaCA9PT0gJ3N0cmluZycpIGluZm9IYXNoID0gbmV3IEJ1ZmZlcihpbmZvSGFzaCwgJ2hleCcpXG4gIGlmICh0eXBlb2YgcGVlcklkID09PSAnc3RyaW5nJykgcGVlcklkID0gbmV3IEJ1ZmZlcihwZWVySWQsICdoZXgnKVxuICBpZiAoaW5mb0hhc2gubGVuZ3RoICE9PSAyMCB8fCBwZWVySWQubGVuZ3RoICE9PSAyMCkge1xuICAgIHRocm93IG5ldyBFcnJvcignaW5mb0hhc2ggYW5kIHBlZXJJZCBNVVNUIGhhdmUgbGVuZ3RoIDIwJylcbiAgfVxuXG4gIHZhciByZXNlcnZlZCA9IG5ldyBCdWZmZXIoTUVTU0FHRV9SRVNFUlZFRClcblxuICAvLyBlbmFibGUgZXh0ZW5kZWQgbWVzc2FnZVxuICByZXNlcnZlZFs1XSB8PSAweDEwXG5cbiAgaWYgKGV4dGVuc2lvbnMgJiYgZXh0ZW5zaW9ucy5kaHQpIHJlc2VydmVkWzddIHw9IDFcblxuICB0aGlzLl9wdXNoKEJ1ZmZlci5jb25jYXQoW01FU1NBR0VfUFJPVE9DT0wsIHJlc2VydmVkLCBpbmZvSGFzaCwgcGVlcklkXSkpXG4gIHRoaXMuX2hhbmRzaGFrZVNlbnQgPSB0cnVlXG5cbiAgaWYgKHRoaXMucGVlckV4dGVuc2lvbnMuZXh0ZW5kZWQpIHtcbiAgICAvLyBQZWVyJ3MgaGFuZHNoYWtlIGluZGljYXRlZCBzdXBwb3J0IGFscmVhZHlcbiAgICAvLyAoaW5jb21pbmcgY29ubmVjdGlvbilcbiAgICB0aGlzLl9zZW5kRXh0ZW5kZWRIYW5kc2hha2UoKVxuICB9XG59XG5cbi8qIFBlZXIgc3VwcG9ydHMgQkVQLTAwMTAsIHNlbmQgZXh0ZW5kZWQgaGFuZHNoYWtlLlxuICpcbiAqIFRoaXMgY29tZXMgYWZ0ZXIgdGhlICdoYW5kc2hha2UnIGV2ZW50IHRvIGdpdmUgdGhlIHVzZXIgYSBjaGFuY2UgdG8gcG9wdWxhdGVcbiAqIGB0aGlzLmV4dGVuZGVkSGFuZHNoYWtlYCBhbmQgYHRoaXMuZXh0ZW5kZWRNYXBwaW5nYCBiZWZvcmUgdGhlIGV4dGVuZGVkIGhhbmRzaGFrZVxuICogaXMgc2VudCB0byB0aGUgcmVtb3RlIHBlZXIuXG4gKi9cbldpcmUucHJvdG90eXBlLl9zZW5kRXh0ZW5kZWRIYW5kc2hha2UgPSBmdW5jdGlvbiAoKSB7XG4gIC8vIENyZWF0ZSBleHRlbmRlZCBtZXNzYWdlIG9iamVjdCBmcm9tIHJlZ2lzdGVyZWQgZXh0ZW5zaW9uc1xuICB2YXIgbXNnID0gZXh0ZW5kKHRoaXMuZXh0ZW5kZWRIYW5kc2hha2UpXG4gIG1zZy5tID0ge31cbiAgZm9yICh2YXIgZXh0IGluIHRoaXMuZXh0ZW5kZWRNYXBwaW5nKSB7XG4gICAgdmFyIG5hbWUgPSB0aGlzLmV4dGVuZGVkTWFwcGluZ1tleHRdXG4gICAgbXNnLm1bbmFtZV0gPSBOdW1iZXIoZXh0KVxuICB9XG5cbiAgLy8gU2VuZCBleHRlbmRlZCBoYW5kc2hha2VcbiAgdGhpcy5leHRlbmRlZCgwLCBiZW5jb2RlLmVuY29kZShtc2cpKVxufVxuXG4vKipcbiAqIE1lc3NhZ2UgXCJjaG9rZVwiOiA8bGVuPTAwMDE+PGlkPTA+XG4gKi9cbldpcmUucHJvdG90eXBlLmNob2tlID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5hbUNob2tpbmcpIHJldHVyblxuICB0aGlzLmFtQ2hva2luZyA9IHRydWVcbiAgdGhpcy5wZWVyUmVxdWVzdHMuc3BsaWNlKDAsIHRoaXMucGVlclJlcXVlc3RzLmxlbmd0aClcbiAgdGhpcy5fcHVzaChNRVNTQUdFX0NIT0tFKVxufVxuXG4vKipcbiAqIE1lc3NhZ2UgXCJ1bmNob2tlXCI6IDxsZW49MDAwMT48aWQ9MT5cbiAqL1xuV2lyZS5wcm90b3R5cGUudW5jaG9rZSA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKCF0aGlzLmFtQ2hva2luZykgcmV0dXJuXG4gIHRoaXMuYW1DaG9raW5nID0gZmFsc2VcbiAgdGhpcy5fcHVzaChNRVNTQUdFX1VOQ0hPS0UpXG59XG5cbi8qKlxuICogTWVzc2FnZSBcImludGVyZXN0ZWRcIjogPGxlbj0wMDAxPjxpZD0yPlxuICovXG5XaXJlLnByb3RvdHlwZS5pbnRlcmVzdGVkID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5hbUludGVyZXN0ZWQpIHJldHVyblxuICB0aGlzLmFtSW50ZXJlc3RlZCA9IHRydWVcbiAgdGhpcy5fcHVzaChNRVNTQUdFX0lOVEVSRVNURUQpXG59XG5cbi8qKlxuICogTWVzc2FnZSBcInVuaW50ZXJlc3RlZFwiOiA8bGVuPTAwMDE+PGlkPTM+XG4gKi9cbldpcmUucHJvdG90eXBlLnVuaW50ZXJlc3RlZCA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKCF0aGlzLmFtSW50ZXJlc3RlZCkgcmV0dXJuXG4gIHRoaXMuYW1JbnRlcmVzdGVkID0gZmFsc2VcbiAgdGhpcy5fcHVzaChNRVNTQUdFX1VOSU5URVJFU1RFRClcbn1cblxuLyoqXG4gKiBNZXNzYWdlIFwiaGF2ZVwiOiA8bGVuPTAwMDU+PGlkPTQ+PHBpZWNlIGluZGV4PlxuICogQHBhcmFtICB7bnVtYmVyfSBpbmRleFxuICovXG5XaXJlLnByb3RvdHlwZS5oYXZlID0gZnVuY3Rpb24gKGluZGV4KSB7XG4gIHRoaXMuX21lc3NhZ2UoNCwgW2luZGV4XSwgbnVsbClcbn1cblxuLyoqXG4gKiBNZXNzYWdlIFwiYml0ZmllbGRcIjogPGxlbj0wMDAxK1g+PGlkPTU+PGJpdGZpZWxkPlxuICogQHBhcmFtICB7Qml0RmllbGR8QnVmZmVyfSBiaXRmaWVsZFxuICovXG5XaXJlLnByb3RvdHlwZS5iaXRmaWVsZCA9IGZ1bmN0aW9uIChiaXRmaWVsZCkge1xuICBpZiAoIUJ1ZmZlci5pc0J1ZmZlcihiaXRmaWVsZCkpIGJpdGZpZWxkID0gYml0ZmllbGQuYnVmZmVyXG4gIHRoaXMuX21lc3NhZ2UoNSwgW10sIGJpdGZpZWxkKVxufVxuXG4vKipcbiAqIE1lc3NhZ2UgXCJyZXF1ZXN0XCI6IDxsZW49MDAxMz48aWQ9Nj48aW5kZXg+PGJlZ2luPjxsZW5ndGg+XG4gKiBAcGFyYW0gIHtudW1iZXJ9ICAgaW5kZXhcbiAqIEBwYXJhbSAge251bWJlcn0gICBvZmZzZXRcbiAqIEBwYXJhbSAge251bWJlcn0gICBsZW5ndGhcbiAqIEBwYXJhbSAge2Z1bmN0aW9ufSBjYlxuICovXG5XaXJlLnByb3RvdHlwZS5yZXF1ZXN0ID0gZnVuY3Rpb24gKGluZGV4LCBvZmZzZXQsIGxlbmd0aCwgY2IpIHtcbiAgaWYgKCFjYikgY2IgPSBmdW5jdGlvbiAoKSB7fVxuXG4gIGlmICh0aGlzLl9maW5pc2hlZCkgcmV0dXJuIGNiKG5ldyBFcnJvcignd2lyZSBpcyBjbG9zZWQnKSlcbiAgaWYgKHRoaXMucGVlckNob2tpbmcpIHJldHVybiBjYihuZXcgRXJyb3IoJ3BlZXIgaXMgY2hva2luZycpKVxuXG4gIHRoaXMucmVxdWVzdHMucHVzaChuZXcgUmVxdWVzdChpbmRleCwgb2Zmc2V0LCBsZW5ndGgsIGNiKSlcbiAgdGhpcy5fdXBkYXRlVGltZW91dCgpXG4gIHRoaXMuX21lc3NhZ2UoNiwgW2luZGV4LCBvZmZzZXQsIGxlbmd0aF0sIG51bGwpXG59XG5cbi8qKlxuICogTWVzc2FnZSBcInBpZWNlXCI6IDxsZW49MDAwOStYPjxpZD03PjxpbmRleD48YmVnaW4+PGJsb2NrPlxuICogQHBhcmFtICB7bnVtYmVyfSBpbmRleFxuICogQHBhcmFtICB7bnVtYmVyfSBvZmZzZXRcbiAqIEBwYXJhbSAge0J1ZmZlcn0gYnVmZmVyXG4gKi9cbldpcmUucHJvdG90eXBlLnBpZWNlID0gZnVuY3Rpb24gKGluZGV4LCBvZmZzZXQsIGJ1ZmZlcikge1xuICB0aGlzLnVwbG9hZGVkICs9IGJ1ZmZlci5sZW5ndGhcbiAgdGhpcy51cGxvYWRTcGVlZChidWZmZXIubGVuZ3RoKVxuICB0aGlzLmVtaXQoJ3VwbG9hZCcsIGJ1ZmZlci5sZW5ndGgpXG4gIHRoaXMuX21lc3NhZ2UoNywgW2luZGV4LCBvZmZzZXRdLCBidWZmZXIpXG59XG5cbi8qKlxuICogTWVzc2FnZSBcImNhbmNlbFwiOiA8bGVuPTAwMTM+PGlkPTg+PGluZGV4PjxiZWdpbj48bGVuZ3RoPlxuICogQHBhcmFtICB7bnVtYmVyfSBpbmRleFxuICogQHBhcmFtICB7bnVtYmVyfSBvZmZzZXRcbiAqIEBwYXJhbSAge251bWJlcn0gbGVuZ3RoXG4gKi9cbldpcmUucHJvdG90eXBlLmNhbmNlbCA9IGZ1bmN0aW9uIChpbmRleCwgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgdGhpcy5fY2FsbGJhY2soXG4gICAgcHVsbCh0aGlzLnJlcXVlc3RzLCBpbmRleCwgb2Zmc2V0LCBsZW5ndGgpLFxuICAgIG5ldyBFcnJvcigncmVxdWVzdCB3YXMgY2FuY2VsbGVkJyksXG4gICAgbnVsbFxuICApXG4gIHRoaXMuX21lc3NhZ2UoOCwgW2luZGV4LCBvZmZzZXQsIGxlbmd0aF0sIG51bGwpXG59XG5cbi8qKlxuICogTWVzc2FnZTogXCJwb3J0XCIgPGxlbj0wMDAzPjxpZD05PjxsaXN0ZW4tcG9ydD5cbiAqIEBwYXJhbSB7TnVtYmVyfSBwb3J0XG4gKi9cbldpcmUucHJvdG90eXBlLnBvcnQgPSBmdW5jdGlvbiAocG9ydCkge1xuICB2YXIgbWVzc2FnZSA9IG5ldyBCdWZmZXIoTUVTU0FHRV9QT1JUKVxuICBtZXNzYWdlLndyaXRlVUludDE2QkUocG9ydCwgNSlcbiAgdGhpcy5fcHVzaChtZXNzYWdlKVxufVxuXG4vKipcbiAqIE1lc3NhZ2U6IFwiZXh0ZW5kZWRcIiA8bGVuPTAwMDUrWD48aWQ9MjA+PGV4dC1udW1iZXI+PHBheWxvYWQ+XG4gKiBAcGFyYW0gIHtudW1iZXJ9IGV4dFxuICogQHBhcmFtICB7T2JqZWN0fSBvYmpcbiAqL1xuV2lyZS5wcm90b3R5cGUuZXh0ZW5kZWQgPSBmdW5jdGlvbiAoZXh0LCBvYmopIHtcbiAgaWYgKHR5cGVvZiBleHQgPT09ICdzdHJpbmcnICYmIHRoaXMucGVlckV4dGVuZGVkTWFwcGluZ1tleHRdKSB7XG4gICAgZXh0ID0gdGhpcy5wZWVyRXh0ZW5kZWRNYXBwaW5nW2V4dF1cbiAgfVxuICBpZiAodHlwZW9mIGV4dCA9PT0gJ251bWJlcicpIHtcbiAgICB2YXIgZXh0X2lkID0gbmV3IEJ1ZmZlcihbZXh0XSlcbiAgICB2YXIgYnVmID0gQnVmZmVyLmlzQnVmZmVyKG9iaikgPyBvYmogOiBiZW5jb2RlLmVuY29kZShvYmopXG5cbiAgICB0aGlzLl9tZXNzYWdlKDIwLCBbXSwgQnVmZmVyLmNvbmNhdChbZXh0X2lkLCBidWZdKSlcbiAgfSBlbHNlIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ1VucmVjb2duaXplZCBleHRlbnNpb246ICcgKyBleHQpXG4gIH1cbn1cblxuLy9cbi8vIElOQ09NSU5HIE1FU1NBR0VTXG4vL1xuXG5XaXJlLnByb3RvdHlwZS5fb25LZWVwQWxpdmUgPSBmdW5jdGlvbiAoKSB7XG4gIHRoaXMuZW1pdCgna2VlcC1hbGl2ZScpXG59XG5cbldpcmUucHJvdG90eXBlLl9vbkhhbmRzaGFrZSA9IGZ1bmN0aW9uIChpbmZvSGFzaCwgcGVlcklkLCBleHRlbnNpb25zKSB7XG4gIHRoaXMucGVlcklkID0gcGVlcklkXG4gIHRoaXMucGVlckV4dGVuc2lvbnMgPSBleHRlbnNpb25zXG4gIHRoaXMuZW1pdCgnaGFuZHNoYWtlJywgaW5mb0hhc2gsIHBlZXJJZCwgZXh0ZW5zaW9ucylcblxuICB2YXIgbmFtZVxuICBmb3IgKG5hbWUgaW4gdGhpcy5fZXh0KSB7XG4gICAgdGhpcy5fZXh0W25hbWVdLm9uSGFuZHNoYWtlKGluZm9IYXNoLCBwZWVySWQsIGV4dGVuc2lvbnMpXG4gIH1cblxuICBpZiAoZXh0ZW5zaW9ucy5leHRlbmRlZCAmJiB0aGlzLl9oYW5kc2hha2VTZW50KSB7XG4gICAgLy8gb3V0Z29pbmcgY29ubmVjdGlvblxuICAgIHRoaXMuX3NlbmRFeHRlbmRlZEhhbmRzaGFrZSgpXG4gIH1cbn1cblxuV2lyZS5wcm90b3R5cGUuX29uQ2hva2UgPSBmdW5jdGlvbiAoKSB7XG4gIHRoaXMucGVlckNob2tpbmcgPSB0cnVlXG4gIHRoaXMuZW1pdCgnY2hva2UnKVxuICB3aGlsZSAodGhpcy5yZXF1ZXN0cy5sZW5ndGgpIHtcbiAgICB0aGlzLl9jYWxsYmFjayh0aGlzLnJlcXVlc3RzLnNoaWZ0KCksIG5ldyBFcnJvcigncGVlciBpcyBjaG9raW5nJyksIG51bGwpXG4gIH1cbn1cblxuV2lyZS5wcm90b3R5cGUuX29uVW5jaG9rZSA9IGZ1bmN0aW9uICgpIHtcbiAgdGhpcy5wZWVyQ2hva2luZyA9IGZhbHNlXG4gIHRoaXMuZW1pdCgndW5jaG9rZScpXG59XG5cbldpcmUucHJvdG90eXBlLl9vbkludGVyZXN0ZWQgPSBmdW5jdGlvbiAoKSB7XG4gIHRoaXMucGVlckludGVyZXN0ZWQgPSB0cnVlXG4gIHRoaXMuZW1pdCgnaW50ZXJlc3RlZCcpXG59XG5cbldpcmUucHJvdG90eXBlLl9vblVuaW50ZXJlc3RlZCA9IGZ1bmN0aW9uICgpIHtcbiAgdGhpcy5wZWVySW50ZXJlc3RlZCA9IGZhbHNlXG4gIHRoaXMuZW1pdCgndW5pbnRlcmVzdGVkJylcbn1cblxuV2lyZS5wcm90b3R5cGUuX29uSGF2ZSA9IGZ1bmN0aW9uIChpbmRleCkge1xuICBpZiAodGhpcy5wZWVyUGllY2VzLmdldChpbmRleCkpIHJldHVyblxuXG4gIHRoaXMucGVlclBpZWNlcy5zZXQoaW5kZXgsIHRydWUpXG4gIHRoaXMuZW1pdCgnaGF2ZScsIGluZGV4KVxufVxuXG5XaXJlLnByb3RvdHlwZS5fb25CaXRGaWVsZCA9IGZ1bmN0aW9uIChidWZmZXIpIHtcbiAgdGhpcy5wZWVyUGllY2VzID0gbmV3IEJpdEZpZWxkKGJ1ZmZlcilcbiAgdGhpcy5lbWl0KCdiaXRmaWVsZCcsIHRoaXMucGVlclBpZWNlcylcbn1cblxuV2lyZS5wcm90b3R5cGUuX29uUmVxdWVzdCA9IGZ1bmN0aW9uIChpbmRleCwgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgaWYgKHRoaXMuYW1DaG9raW5nKSByZXR1cm5cblxuICB2YXIgcmVzcG9uZCA9IGZ1bmN0aW9uIChlcnIsIGJ1ZmZlcikge1xuICAgIGlmIChyZXF1ZXN0ICE9PSBwdWxsKHRoaXMucGVlclJlcXVlc3RzLCBpbmRleCwgb2Zmc2V0LCBsZW5ndGgpKSByZXR1cm5cbiAgICBpZiAoZXJyKSByZXR1cm5cbiAgICB0aGlzLnBpZWNlKGluZGV4LCBvZmZzZXQsIGJ1ZmZlcilcbiAgfS5iaW5kKHRoaXMpXG5cbiAgdmFyIHJlcXVlc3QgPSBuZXcgUmVxdWVzdChpbmRleCwgb2Zmc2V0LCBsZW5ndGgsIHJlc3BvbmQpXG4gIHRoaXMucGVlclJlcXVlc3RzLnB1c2gocmVxdWVzdClcbiAgdGhpcy5lbWl0KCdyZXF1ZXN0JywgaW5kZXgsIG9mZnNldCwgbGVuZ3RoLCByZXNwb25kKVxufVxuXG5XaXJlLnByb3RvdHlwZS5fb25QaWVjZSA9IGZ1bmN0aW9uIChpbmRleCwgb2Zmc2V0LCBidWZmZXIpIHtcbiAgdGhpcy5fY2FsbGJhY2socHVsbCh0aGlzLnJlcXVlc3RzLCBpbmRleCwgb2Zmc2V0LCBidWZmZXIubGVuZ3RoKSwgbnVsbCwgYnVmZmVyKVxuICB0aGlzLmRvd25sb2FkZWQgKz0gYnVmZmVyLmxlbmd0aFxuICB0aGlzLmRvd25sb2FkU3BlZWQoYnVmZmVyLmxlbmd0aClcbiAgdGhpcy5lbWl0KCdkb3dubG9hZCcsIGJ1ZmZlci5sZW5ndGgpXG4gIHRoaXMuZW1pdCgncGllY2UnLCBpbmRleCwgb2Zmc2V0LCBidWZmZXIpXG59XG5cbldpcmUucHJvdG90eXBlLl9vbkNhbmNlbCA9IGZ1bmN0aW9uIChpbmRleCwgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgcHVsbCh0aGlzLnBlZXJSZXF1ZXN0cywgaW5kZXgsIG9mZnNldCwgbGVuZ3RoKVxuICB0aGlzLmVtaXQoJ2NhbmNlbCcsIGluZGV4LCBvZmZzZXQsIGxlbmd0aClcbn1cblxuV2lyZS5wcm90b3R5cGUuX29uUG9ydCA9IGZ1bmN0aW9uIChwb3J0KSB7XG4gIHRoaXMuZW1pdCgncG9ydCcsIHBvcnQpXG59XG5cbldpcmUucHJvdG90eXBlLl9vbkV4dGVuZGVkID0gZnVuY3Rpb24gKGV4dCwgYnVmKSB7XG4gIHZhciBpbmZvLCBuYW1lXG4gIGlmIChleHQgPT09IDAgJiYgKGluZm8gPSBzYWZlQmRlY29kZShidWYpKSkge1xuICAgIHRoaXMucGVlckV4dGVuZGVkSGFuZHNoYWtlID0gaW5mb1xuICAgIGlmICh0eXBlb2YgaW5mby5tID09PSAnb2JqZWN0Jykge1xuICAgICAgZm9yIChuYW1lIGluIGluZm8ubSkge1xuICAgICAgICB0aGlzLnBlZXJFeHRlbmRlZE1hcHBpbmdbbmFtZV0gPSBOdW1iZXIoaW5mby5tW25hbWVdLnRvU3RyaW5nKCkpXG4gICAgICB9XG4gICAgfVxuICAgIGZvciAobmFtZSBpbiB0aGlzLl9leHQpIHtcbiAgICAgIGlmICh0aGlzLnBlZXJFeHRlbmRlZE1hcHBpbmdbbmFtZV0pIHtcbiAgICAgICAgdGhpcy5fZXh0W25hbWVdLm9uRXh0ZW5kZWRIYW5kc2hha2UodGhpcy5wZWVyRXh0ZW5kZWRIYW5kc2hha2UpXG4gICAgICB9XG4gICAgfVxuICAgIHRoaXMuZW1pdCgnZXh0ZW5kZWQnLCAnaGFuZHNoYWtlJywgdGhpcy5wZWVyRXh0ZW5kZWRIYW5kc2hha2UpXG4gIH0gZWxzZSB7XG4gICAgaWYgKHRoaXMuZXh0ZW5kZWRNYXBwaW5nW2V4dF0pIHtcbiAgICAgIGV4dCA9IHRoaXMuZXh0ZW5kZWRNYXBwaW5nW2V4dF0gLy8gZnJpZW5kbHkgbmFtZSBmb3IgZXh0ZW5zaW9uXG4gICAgICBpZiAodGhpcy5fZXh0W2V4dF0pIHtcbiAgICAgICAgLy8gdGhlcmUgaXMgYW4gcmVnaXN0ZXJlZCBleHRlbnNpb24gaGFuZGxlciwgc28gY2FsbCBpdFxuICAgICAgICB0aGlzLl9leHRbZXh0XS5vbk1lc3NhZ2UoYnVmKVxuICAgICAgfVxuICAgIH1cbiAgICB0aGlzLmVtaXQoJ2V4dGVuZGVkJywgZXh0LCBidWYpXG4gIH1cbn1cblxuV2lyZS5wcm90b3R5cGUuX29uVGltZW91dCA9IGZ1bmN0aW9uICgpIHtcbiAgdGhpcy5fY2FsbGJhY2sodGhpcy5yZXF1ZXN0cy5zaGlmdCgpLCBuZXcgRXJyb3IoJ3JlcXVlc3QgaGFzIHRpbWVkIG91dCcpLCBudWxsKVxuICB0aGlzLmVtaXQoJ3RpbWVvdXQnKVxufVxuXG4vL1xuLy8gU1RSRUFNIE1FVEhPRFNcbi8vXG5cbi8qKlxuICogUHVzaCBhIG1lc3NhZ2UgdG8gdGhlIHJlbW90ZSBwZWVyLlxuICogQHBhcmFtIHtCdWZmZXJ9IGRhdGFcbiAqL1xuV2lyZS5wcm90b3R5cGUuX3B1c2ggPSBmdW5jdGlvbiAoZGF0YSkge1xuICBpZiAodGhpcy5fZmluaXNoZWQpIHJldHVyblxuICByZXR1cm4gdGhpcy5wdXNoKGRhdGEpXG59XG5cbi8qKlxuICogRHVwbGV4IHN0cmVhbSBtZXRob2QuIENhbGxlZCB3aGVuZXZlciB0aGUgdXBzdHJlYW0gaGFzIGRhdGEgZm9yIHVzLlxuICogQHBhcmFtICB7QnVmZmVyfHN0cmluZ30gZGF0YVxuICogQHBhcmFtICB7c3RyaW5nfSAgIGVuY29kaW5nXG4gKiBAcGFyYW0gIHtmdW5jdGlvbn0gY2JcbiAqL1xuV2lyZS5wcm90b3R5cGUuX3dyaXRlID0gZnVuY3Rpb24gKGRhdGEsIGVuY29kaW5nLCBjYikge1xuICB0aGlzLl9idWZmZXJTaXplICs9IGRhdGEubGVuZ3RoXG4gIHRoaXMuX2J1ZmZlci5wdXNoKGRhdGEpXG5cbiAgd2hpbGUgKHRoaXMuX2J1ZmZlclNpemUgPj0gdGhpcy5fcGFyc2VyU2l6ZSkge1xuICAgIHZhciBidWZmZXIgPSAodGhpcy5fYnVmZmVyLmxlbmd0aCA9PT0gMSlcbiAgICAgID8gdGhpcy5fYnVmZmVyWzBdXG4gICAgICA6IEJ1ZmZlci5jb25jYXQodGhpcy5fYnVmZmVyKVxuICAgIHRoaXMuX2J1ZmZlclNpemUgLT0gdGhpcy5fcGFyc2VyU2l6ZVxuICAgIHRoaXMuX2J1ZmZlciA9IHRoaXMuX2J1ZmZlclNpemVcbiAgICAgID8gW2J1ZmZlci5zbGljZSh0aGlzLl9wYXJzZXJTaXplKV1cbiAgICAgIDogW11cbiAgICB0aGlzLl9wYXJzZXIoYnVmZmVyLnNsaWNlKDAsIHRoaXMuX3BhcnNlclNpemUpKVxuICB9XG5cbiAgY2IobnVsbCkgLy8gU2lnbmFsIHRoYXQgd2UncmUgcmVhZHkgZm9yIG1vcmUgZGF0YVxufVxuXG4vKipcbiAqIER1cGxleCBzdHJlYW0gbWV0aG9kLiBDYWxsZWQgd2hlbmV2ZXIgdGhlIGRvd25zdHJlYW0gd2FudHMgZGF0YS4gTm8tb3BcbiAqIHNpbmNlIHdlJ2xsIGp1c3QgcHVzaCBkYXRhIHdoZW5ldmVyIHdlIGdldCBpdC4gRXh0cmEgZGF0YSB3aWxsIGJlIGJ1ZmZlcmVkXG4gKiBpbiBtZW1vcnkgKHdlIGRvbid0IHdhbnQgdG8gYXBwbHkgYmFja3ByZXNzdXJlIHRvIHBlZXJzISkuXG4gKi9cbldpcmUucHJvdG90eXBlLl9yZWFkID0gZnVuY3Rpb24gKCkge31cblxuV2lyZS5wcm90b3R5cGUuX2NhbGxiYWNrID0gZnVuY3Rpb24gKHJlcXVlc3QsIGVyciwgYnVmZmVyKSB7XG4gIGlmICghcmVxdWVzdCkgcmV0dXJuXG5cbiAgdGhpcy5fY2xlYXJUaW1lb3V0KClcblxuICBpZiAoIXRoaXMucGVlckNob2tpbmcgJiYgIXRoaXMuX2ZpbmlzaGVkKSB0aGlzLl91cGRhdGVUaW1lb3V0KClcbiAgcmVxdWVzdC5jYWxsYmFjayhlcnIsIGJ1ZmZlcilcbn1cblxuV2lyZS5wcm90b3R5cGUuX2NsZWFyVGltZW91dCA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKCF0aGlzLl90aW1lb3V0KSByZXR1cm5cblxuICBjbGVhclRpbWVvdXQodGhpcy5fdGltZW91dClcbiAgdGhpcy5fdGltZW91dCA9IG51bGxcbn1cblxuV2lyZS5wcm90b3R5cGUuX3VwZGF0ZVRpbWVvdXQgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICghdGhpcy5fdGltZW91dE1zIHx8ICF0aGlzLnJlcXVlc3RzLmxlbmd0aCB8fCB0aGlzLl90aW1lb3V0KSByZXR1cm5cblxuICB0aGlzLl90aW1lb3V0ID0gc2V0VGltZW91dCh0aGlzLl9vblRpbWVvdXQuYmluZCh0aGlzKSwgdGhpcy5fdGltZW91dE1zKVxufVxuXG5XaXJlLnByb3RvdHlwZS5fcGFyc2UgPSBmdW5jdGlvbiAoc2l6ZSwgcGFyc2VyKSB7XG4gIHRoaXMuX3BhcnNlclNpemUgPSBzaXplXG4gIHRoaXMuX3BhcnNlciA9IHBhcnNlclxufVxuXG5XaXJlLnByb3RvdHlwZS5fbWVzc2FnZSA9IGZ1bmN0aW9uIChpZCwgbnVtYmVycywgZGF0YSkge1xuICB2YXIgZGF0YUxlbmd0aCA9IGRhdGEgPyBkYXRhLmxlbmd0aCA6IDBcbiAgdmFyIGJ1ZmZlciA9IG5ldyBCdWZmZXIoNSArIDQgKiBudW1iZXJzLmxlbmd0aClcblxuICBidWZmZXIud3JpdGVVSW50MzJCRShidWZmZXIubGVuZ3RoICsgZGF0YUxlbmd0aCAtIDQsIDApXG4gIGJ1ZmZlcls0XSA9IGlkXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbnVtYmVycy5sZW5ndGg7IGkrKykge1xuICAgIGJ1ZmZlci53cml0ZVVJbnQzMkJFKG51bWJlcnNbaV0sIDUgKyA0ICogaSlcbiAgfVxuXG4gIHRoaXMuX3B1c2goYnVmZmVyKVxuICBpZiAoZGF0YSkgdGhpcy5fcHVzaChkYXRhKVxufVxuXG5XaXJlLnByb3RvdHlwZS5fb25tZXNzYWdlbGVuZ3RoID0gZnVuY3Rpb24gKGJ1ZmZlcikge1xuICB2YXIgbGVuZ3RoID0gYnVmZmVyLnJlYWRVSW50MzJCRSgwKVxuICBpZiAobGVuZ3RoID4gMCkge1xuICAgIHRoaXMuX3BhcnNlKGxlbmd0aCwgdGhpcy5fb25tZXNzYWdlKVxuICB9IGVsc2Uge1xuICAgIHRoaXMuX29uS2VlcEFsaXZlKClcbiAgICB0aGlzLl9wYXJzZSg0LCB0aGlzLl9vbm1lc3NhZ2VsZW5ndGgpXG4gIH1cbn1cblxuV2lyZS5wcm90b3R5cGUuX29ubWVzc2FnZSA9IGZ1bmN0aW9uIChidWZmZXIpIHtcbiAgdGhpcy5fcGFyc2UoNCwgdGhpcy5fb25tZXNzYWdlbGVuZ3RoKVxuICBzd2l0Y2ggKGJ1ZmZlclswXSkge1xuICAgIGNhc2UgMDpcbiAgICAgIHJldHVybiB0aGlzLl9vbkNob2tlKClcbiAgICBjYXNlIDE6XG4gICAgICByZXR1cm4gdGhpcy5fb25VbmNob2tlKClcbiAgICBjYXNlIDI6XG4gICAgICByZXR1cm4gdGhpcy5fb25JbnRlcmVzdGVkKClcbiAgICBjYXNlIDM6XG4gICAgICByZXR1cm4gdGhpcy5fb25VbmludGVyZXN0ZWQoKVxuICAgIGNhc2UgNDpcbiAgICAgIHJldHVybiB0aGlzLl9vbkhhdmUoYnVmZmVyLnJlYWRVSW50MzJCRSgxKSlcbiAgICBjYXNlIDU6XG4gICAgICByZXR1cm4gdGhpcy5fb25CaXRGaWVsZChidWZmZXIuc2xpY2UoMSkpXG4gICAgY2FzZSA2OlxuICAgICAgcmV0dXJuIHRoaXMuX29uUmVxdWVzdChidWZmZXIucmVhZFVJbnQzMkJFKDEpLFxuICAgICAgICAgIGJ1ZmZlci5yZWFkVUludDMyQkUoNSksIGJ1ZmZlci5yZWFkVUludDMyQkUoOSkpXG4gICAgY2FzZSA3OlxuICAgICAgcmV0dXJuIHRoaXMuX29uUGllY2UoYnVmZmVyLnJlYWRVSW50MzJCRSgxKSxcbiAgICAgICAgICBidWZmZXIucmVhZFVJbnQzMkJFKDUpLCBidWZmZXIuc2xpY2UoOSkpXG4gICAgY2FzZSA4OlxuICAgICAgcmV0dXJuIHRoaXMuX29uQ2FuY2VsKGJ1ZmZlci5yZWFkVUludDMyQkUoMSksXG4gICAgICAgICAgYnVmZmVyLnJlYWRVSW50MzJCRSg1KSwgYnVmZmVyLnJlYWRVSW50MzJCRSg5KSlcbiAgICBjYXNlIDk6XG4gICAgICByZXR1cm4gdGhpcy5fb25Qb3J0KGJ1ZmZlci5yZWFkVUludDE2QkUoMSkpXG4gICAgY2FzZSAyMDpcbiAgICAgIHJldHVybiB0aGlzLl9vbkV4dGVuZGVkKGJ1ZmZlci5yZWFkVUludDgoMSksIGJ1ZmZlci5zbGljZSgyKSlcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIHRoaXMuZW1pdCgndW5rbm93bm1lc3NhZ2UnLCBidWZmZXIpXG4gIH1cbn1cblxuV2lyZS5wcm90b3R5cGUuX3BhcnNlSGFuZHNoYWtlID0gZnVuY3Rpb24gKCkge1xuICB0aGlzLl9wYXJzZSgxLCBmdW5jdGlvbiAoYnVmZmVyKSB7XG4gICAgdmFyIHBzdHJsZW4gPSBidWZmZXIucmVhZFVJbnQ4KDApXG4gICAgdGhpcy5fcGFyc2UocHN0cmxlbiArIDQ4LCBmdW5jdGlvbiAoaGFuZHNoYWtlKSB7XG4gICAgICB2YXIgcHJvdG9jb2wgPSBoYW5kc2hha2Uuc2xpY2UoMCwgcHN0cmxlbilcbiAgICAgIGlmIChwcm90b2NvbC50b1N0cmluZygpICE9PSAnQml0VG9ycmVudCBwcm90b2NvbCcpIHtcbiAgICAgICAgZGVidWcoJ0Vycm9yOiB3aXJlIG5vdCBzcGVha2luZyBCaXRUb3JyZW50IHByb3RvY29sICglcyknLCBwcm90b2NvbC50b1N0cmluZygpKVxuICAgICAgICB0aGlzLmVuZCgpXG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgICAgaGFuZHNoYWtlID0gaGFuZHNoYWtlLnNsaWNlKHBzdHJsZW4pXG4gICAgICB0aGlzLl9vbkhhbmRzaGFrZShoYW5kc2hha2Uuc2xpY2UoOCwgMjgpLCBoYW5kc2hha2Uuc2xpY2UoMjgsIDQ4KSwge1xuICAgICAgICBkaHQ6ICEhKGhhbmRzaGFrZVs3XSAmIDB4MDEpLCAvLyBzZWUgYmVwXzAwMDVcbiAgICAgICAgZXh0ZW5kZWQ6ICEhKGhhbmRzaGFrZVs1XSAmIDB4MTApIC8vIHNlZSBiZXBfMDAxMFxuICAgICAgfSlcbiAgICAgIHRoaXMuX3BhcnNlKDQsIHRoaXMuX29ubWVzc2FnZWxlbmd0aClcbiAgICB9LmJpbmQodGhpcykpXG4gIH0uYmluZCh0aGlzKSlcbn1cblxuV2lyZS5wcm90b3R5cGUuX29uZmluaXNoID0gZnVuY3Rpb24gKCkge1xuICB0aGlzLl9maW5pc2hlZCA9IHRydWVcblxuICB0aGlzLnB1c2gobnVsbCkgLy8gc3RyZWFtIGNhbm5vdCBiZSBoYWxmIG9wZW4sIHNvIHNpZ25hbCB0aGUgZW5kIG9mIGl0XG4gIHdoaWxlICh0aGlzLnJlYWQoKSkge30gLy8gY29uc3VtZSBhbmQgZGlzY2FyZCB0aGUgcmVzdCBvZiB0aGUgc3RyZWFtIGRhdGFcblxuICBjbGVhckludGVydmFsKHRoaXMuX2tlZXBBbGl2ZSlcbiAgdGhpcy5fcGFyc2UoTnVtYmVyLk1BWF9WQUxVRSwgZnVuY3Rpb24gKCkge30pXG4gIHRoaXMucGVlclJlcXVlc3RzID0gW11cbiAgd2hpbGUgKHRoaXMucmVxdWVzdHMubGVuZ3RoKSB7XG4gICAgdGhpcy5fY2FsbGJhY2sodGhpcy5yZXF1ZXN0cy5zaGlmdCgpLCBuZXcgRXJyb3IoJ3dpcmUgd2FzIGNsb3NlZCcpLCBudWxsKVxuICB9XG59XG5cbmZ1bmN0aW9uIHB1bGwgKHJlcXVlc3RzLCBwaWVjZSwgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCByZXF1ZXN0cy5sZW5ndGg7IGkrKykge1xuICAgIHZhciByZXEgPSByZXF1ZXN0c1tpXVxuICAgIGlmIChyZXEucGllY2UgIT09IHBpZWNlIHx8IHJlcS5vZmZzZXQgIT09IG9mZnNldCB8fCByZXEubGVuZ3RoICE9PSBsZW5ndGgpIGNvbnRpbnVlXG5cbiAgICBpZiAoaSA9PT0gMCkgcmVxdWVzdHMuc2hpZnQoKVxuICAgIGVsc2UgcmVxdWVzdHMuc3BsaWNlKGksIDEpXG5cbiAgICByZXR1cm4gcmVxXG4gIH1cbiAgcmV0dXJuIG51bGxcbn1cblxuZnVuY3Rpb24gc2FmZUJkZWNvZGUgKGJ1Zikge1xuICB0cnkge1xuICAgIHJldHVybiBiZW5jb2RlLmRlY29kZShidWYpXG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBjb25zb2xlLndhcm4oZSlcbiAgfVxufVxuIiwidmFyIERpY3QgPSByZXF1aXJlKFwiLi9kaWN0XCIpXG5cbi8qKlxuICogRGVjb2RlcyBiZW5jb2RlZCBkYXRhLlxuICpcbiAqIEBwYXJhbSAge0J1ZmZlcn0gZGF0YVxuICogQHBhcmFtICB7U3RyaW5nfSBlbmNvZGluZ1xuICogQHJldHVybiB7T2JqZWN0fEFycmF5fEJ1ZmZlcnxTdHJpbmd8TnVtYmVyfVxuICovXG5mdW5jdGlvbiBkZWNvZGUoIGRhdGEsIGVuY29kaW5nICkge1xuXG4gIGRlY29kZS5wb3NpdGlvbiA9IDBcbiAgZGVjb2RlLmVuY29kaW5nID0gZW5jb2RpbmcgfHwgbnVsbFxuXG4gIGRlY29kZS5kYXRhID0gISggQnVmZmVyLmlzQnVmZmVyKGRhdGEpIClcbiAgICA/IG5ldyBCdWZmZXIoIGRhdGEgKVxuICAgIDogZGF0YVxuXG4gIHJldHVybiBkZWNvZGUubmV4dCgpXG5cbn1cblxuZGVjb2RlLnBvc2l0aW9uID0gMFxuZGVjb2RlLmRhdGEgICAgID0gbnVsbFxuZGVjb2RlLmVuY29kaW5nID0gbnVsbFxuXG5kZWNvZGUubmV4dCA9IGZ1bmN0aW9uKCkge1xuXG4gIHN3aXRjaCggZGVjb2RlLmRhdGFbZGVjb2RlLnBvc2l0aW9uXSApIHtcbiAgICBjYXNlIDB4NjQ6IHJldHVybiBkZWNvZGUuZGljdGlvbmFyeSgpOyBicmVha1xuICAgIGNhc2UgMHg2QzogcmV0dXJuIGRlY29kZS5saXN0KCk7IGJyZWFrXG4gICAgY2FzZSAweDY5OiByZXR1cm4gZGVjb2RlLmludGVnZXIoKTsgYnJlYWtcbiAgICBkZWZhdWx0OiAgIHJldHVybiBkZWNvZGUuYnl0ZXMoKTsgYnJlYWtcbiAgfVxuXG59XG5cbmRlY29kZS5maW5kID0gZnVuY3Rpb24oIGNociApIHtcblxuICB2YXIgaSA9IGRlY29kZS5wb3NpdGlvblxuICB2YXIgYyA9IGRlY29kZS5kYXRhLmxlbmd0aFxuICB2YXIgZCA9IGRlY29kZS5kYXRhXG5cbiAgd2hpbGUoIGkgPCBjICkge1xuICAgIGlmKCBkW2ldID09PSBjaHIgKVxuICAgICAgcmV0dXJuIGlcbiAgICBpKytcbiAgfVxuXG4gIHRocm93IG5ldyBFcnJvcihcbiAgICAnSW52YWxpZCBkYXRhOiBNaXNzaW5nIGRlbGltaXRlciBcIicgK1xuICAgIFN0cmluZy5mcm9tQ2hhckNvZGUoIGNociApICsgJ1wiIFsweCcgK1xuICAgIGNoci50b1N0cmluZyggMTYgKSArICddJ1xuICApXG5cbn1cblxuZGVjb2RlLmRpY3Rpb25hcnkgPSBmdW5jdGlvbigpIHtcblxuICBkZWNvZGUucG9zaXRpb24rK1xuXG4gIHZhciBkaWN0ID0gbmV3IERpY3QoKVxuXG4gIHdoaWxlKCBkZWNvZGUuZGF0YVtkZWNvZGUucG9zaXRpb25dICE9PSAweDY1ICkge1xuICAgIGRpY3QuYmluYXJ5U2V0KGRlY29kZS5ieXRlcygpLCBkZWNvZGUubmV4dCgpKVxuICB9XG5cbiAgZGVjb2RlLnBvc2l0aW9uKytcblxuICByZXR1cm4gZGljdFxuXG59XG5cbmRlY29kZS5saXN0ID0gZnVuY3Rpb24oKSB7XG5cbiAgZGVjb2RlLnBvc2l0aW9uKytcblxuICB2YXIgbHN0ID0gW11cblxuICB3aGlsZSggZGVjb2RlLmRhdGFbZGVjb2RlLnBvc2l0aW9uXSAhPT0gMHg2NSApIHtcbiAgICBsc3QucHVzaCggZGVjb2RlLm5leHQoKSApXG4gIH1cblxuICBkZWNvZGUucG9zaXRpb24rK1xuXG4gIHJldHVybiBsc3RcblxufVxuXG5kZWNvZGUuaW50ZWdlciA9IGZ1bmN0aW9uKCkge1xuXG4gIHZhciBlbmQgICAgPSBkZWNvZGUuZmluZCggMHg2NSApXG4gIHZhciBudW1iZXIgPSBkZWNvZGUuZGF0YS50b1N0cmluZyggJ2FzY2lpJywgZGVjb2RlLnBvc2l0aW9uICsgMSwgZW5kIClcblxuICBkZWNvZGUucG9zaXRpb24gKz0gZW5kICsgMSAtIGRlY29kZS5wb3NpdGlvblxuXG4gIHJldHVybiBwYXJzZUludCggbnVtYmVyLCAxMCApXG5cbn1cblxuZGVjb2RlLmJ5dGVzID0gZnVuY3Rpb24oKSB7XG5cbiAgdmFyIHNlcCAgICA9IGRlY29kZS5maW5kKCAweDNBIClcbiAgdmFyIGxlbmd0aCA9IHBhcnNlSW50KCBkZWNvZGUuZGF0YS50b1N0cmluZyggJ2FzY2lpJywgZGVjb2RlLnBvc2l0aW9uLCBzZXAgKSwgMTAgKVxuICB2YXIgZW5kICAgID0gKytzZXAgKyBsZW5ndGhcblxuICBkZWNvZGUucG9zaXRpb24gPSBlbmRcblxuICByZXR1cm4gZGVjb2RlLmVuY29kaW5nXG4gICAgPyBkZWNvZGUuZGF0YS50b1N0cmluZyggZGVjb2RlLmVuY29kaW5nLCBzZXAsIGVuZCApXG4gICAgOiBkZWNvZGUuZGF0YS5zbGljZSggc2VwLCBlbmQgKVxuXG59XG5cbi8vIEV4cG9ydHNcbm1vZHVsZS5leHBvcnRzID0gZGVjb2RlXG4iLCIvKipcbiAqIEVuY29kZXMgZGF0YSBpbiBiZW5jb2RlLlxuICpcbiAqIEBwYXJhbSAge0J1ZmZlcnxBcnJheXxTdHJpbmd8T2JqZWN0fE51bWJlcn0gZGF0YVxuICogQHJldHVybiB7QnVmZmVyfVxuICovXG5mdW5jdGlvbiBlbmNvZGUoIGRhdGEgKSB7XG4gIHZhciBidWZmZXJzID0gW11cbiAgZW5jb2RlLl9lbmNvZGUoIGJ1ZmZlcnMsIGRhdGEgKVxuICByZXR1cm4gQnVmZmVyLmNvbmNhdCggYnVmZmVycyApXG59XG5cbmVuY29kZS5fZmxvYXRDb252ZXJzaW9uRGV0ZWN0ZWQgPSBmYWxzZVxuXG5lbmNvZGUuX2VuY29kZSA9IGZ1bmN0aW9uKCBidWZmZXJzLCBkYXRhICkge1xuXG4gIGlmKCBCdWZmZXIuaXNCdWZmZXIoZGF0YSkgKSB7XG4gICAgYnVmZmVycy5wdXNoKG5ldyBCdWZmZXIoZGF0YS5sZW5ndGggKyAnOicpKVxuICAgIGJ1ZmZlcnMucHVzaChkYXRhKVxuICAgIHJldHVybjtcbiAgfVxuXG4gIHN3aXRjaCggdHlwZW9mIGRhdGEgKSB7XG4gICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgIGVuY29kZS5ieXRlcyggYnVmZmVycywgZGF0YSApXG4gICAgICBicmVha1xuICAgIGNhc2UgJ251bWJlcic6XG4gICAgICBlbmNvZGUubnVtYmVyKCBidWZmZXJzLCBkYXRhIClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgIGRhdGEuY29uc3RydWN0b3IgPT09IEFycmF5XG4gICAgICAgID8gZW5jb2RlLmxpc3QoIGJ1ZmZlcnMsIGRhdGEgKVxuICAgICAgICA6IGVuY29kZS5kaWN0KCBidWZmZXJzLCBkYXRhIClcbiAgICAgIGJyZWFrXG4gIH1cblxufVxuXG52YXIgYnVmZl9lID0gbmV3IEJ1ZmZlcignZScpXG4gICwgYnVmZl9kID0gbmV3IEJ1ZmZlcignZCcpXG4gICwgYnVmZl9sID0gbmV3IEJ1ZmZlcignbCcpXG5cbmVuY29kZS5ieXRlcyA9IGZ1bmN0aW9uKCBidWZmZXJzLCBkYXRhICkge1xuXG4gIGJ1ZmZlcnMucHVzaCggbmV3IEJ1ZmZlcihCdWZmZXIuYnl0ZUxlbmd0aCggZGF0YSApICsgJzonICsgZGF0YSkgKVxufVxuXG5lbmNvZGUubnVtYmVyID0gZnVuY3Rpb24oIGJ1ZmZlcnMsIGRhdGEgKSB7XG4gIHZhciBtYXhMbyA9IDB4ODAwMDAwMDBcbiAgdmFyIGhpID0gKCBkYXRhIC8gbWF4TG8gKSA8PCAwXG4gIHZhciBsbyA9ICggZGF0YSAlIG1heExvICApIDw8IDBcbiAgdmFyIHZhbCA9IGhpICogbWF4TG8gKyBsb1xuXG4gIGJ1ZmZlcnMucHVzaCggbmV3IEJ1ZmZlciggJ2knICsgdmFsICsgJ2UnICkpXG5cbiAgaWYoIHZhbCAhPT0gZGF0YSAmJiAhZW5jb2RlLl9mbG9hdENvbnZlcnNpb25EZXRlY3RlZCApIHtcbiAgICBlbmNvZGUuX2Zsb2F0Q29udmVyc2lvbkRldGVjdGVkID0gdHJ1ZVxuICAgIGNvbnNvbGUud2FybihcbiAgICAgICdXQVJOSU5HOiBQb3NzaWJsZSBkYXRhIGNvcnJ1cHRpb24gZGV0ZWN0ZWQgd2l0aCB2YWx1ZSBcIicrZGF0YSsnXCI6JyxcbiAgICAgICdCZW5jb2Rpbmcgb25seSBkZWZpbmVzIHN1cHBvcnQgZm9yIGludGVnZXJzLCB2YWx1ZSB3YXMgY29udmVydGVkIHRvIFwiJyt2YWwrJ1wiJ1xuICAgIClcbiAgICBjb25zb2xlLnRyYWNlKClcbiAgfVxuXG59XG5cbmVuY29kZS5kaWN0ID0gZnVuY3Rpb24oIGJ1ZmZlcnMsIGRhdGEgKSB7XG5cbiAgYnVmZmVycy5wdXNoKCBidWZmX2QgKVxuXG4gIHZhciBqID0gMFxuICB2YXIga1xuICAvLyBmaXggZm9yIGlzc3VlICMxMyAtIHNvcnRlZCBkaWN0c1xuICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKCBkYXRhICkuc29ydCgpXG4gIHZhciBrbCA9IGtleXMubGVuZ3RoXG5cbiAgZm9yKCA7IGogPCBrbCA7IGorKykge1xuICAgIGs9a2V5c1tqXVxuICAgIGVuY29kZS5ieXRlcyggYnVmZmVycywgayApXG4gICAgZW5jb2RlLl9lbmNvZGUoIGJ1ZmZlcnMsIGRhdGFba10gKVxuICB9XG5cbiAgYnVmZmVycy5wdXNoKCBidWZmX2UgKVxufVxuXG5lbmNvZGUubGlzdCA9IGZ1bmN0aW9uKCBidWZmZXJzLCBkYXRhICkge1xuXG4gIHZhciBpID0gMCwgaiA9IDFcbiAgdmFyIGMgPSBkYXRhLmxlbmd0aFxuICBidWZmZXJzLnB1c2goIGJ1ZmZfbCApXG5cbiAgZm9yKCA7IGkgPCBjOyBpKysgKSB7XG4gICAgZW5jb2RlLl9lbmNvZGUoIGJ1ZmZlcnMsIGRhdGFbaV0gKVxuICB9XG5cbiAgYnVmZmVycy5wdXNoKCBidWZmX2UgKVxuXG59XG5cbi8vIEV4cG9zZVxubW9kdWxlLmV4cG9ydHMgPSBlbmNvZGVcbiIsIm1vZHVsZS5leHBvcnRzID0gZXh0ZW5kXG5cbmZ1bmN0aW9uIGV4dGVuZCgpIHtcbiAgICB2YXIgdGFyZ2V0ID0ge31cblxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYXJndW1lbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHZhciBzb3VyY2UgPSBhcmd1bWVudHNbaV1cblxuICAgICAgICBmb3IgKHZhciBrZXkgaW4gc291cmNlKSB7XG4gICAgICAgICAgICBpZiAoc291cmNlLmhhc093blByb3BlcnR5KGtleSkpIHtcbiAgICAgICAgICAgICAgICB0YXJnZXRba2V5XSA9IHNvdXJjZVtrZXldXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gdGFyZ2V0XG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGV4dGVuZFxuXG5mdW5jdGlvbiBleHRlbmQodGFyZ2V0KSB7XG4gICAgZm9yICh2YXIgaSA9IDE7IGkgPCBhcmd1bWVudHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmFyIHNvdXJjZSA9IGFyZ3VtZW50c1tpXVxuXG4gICAgICAgIGZvciAodmFyIGtleSBpbiBzb3VyY2UpIHtcbiAgICAgICAgICAgIGlmIChzb3VyY2UuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuICAgICAgICAgICAgICAgIHRhcmdldFtrZXldID0gc291cmNlW2tleV1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB0YXJnZXRcbn1cbiIsIi8qKlxuICogR2l2ZW4gYSBudW1iZXIsIHJldHVybiBhIHplcm8tZmlsbGVkIHN0cmluZy5cbiAqIEZyb20gaHR0cDovL3N0YWNrb3ZlcmZsb3cuY29tL3F1ZXN0aW9ucy8xMjY3MjgzL1xuICogQHBhcmFtICB7bnVtYmVyfSB3aWR0aFxuICogQHBhcmFtICB7bnVtYmVyfSBudW1iZXJcbiAqIEByZXR1cm4ge3N0cmluZ31cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiB6ZXJvRmlsbCAod2lkdGgsIG51bWJlciwgcGFkKSB7XG4gIGlmIChudW1iZXIgPT09IHVuZGVmaW5lZCkge1xuICAgIHJldHVybiBmdW5jdGlvbiAobnVtYmVyLCBwYWQpIHtcbiAgICAgIHJldHVybiB6ZXJvRmlsbCh3aWR0aCwgbnVtYmVyLCBwYWQpXG4gICAgfVxuICB9XG4gIGlmIChwYWQgPT09IHVuZGVmaW5lZCkgcGFkID0gJzAnXG4gIHdpZHRoIC09IG51bWJlci50b1N0cmluZygpLmxlbmd0aFxuICBpZiAod2lkdGggPiAwKSByZXR1cm4gbmV3IEFycmF5KHdpZHRoICsgKC9cXC4vLnRlc3QobnVtYmVyKSA/IDIgOiAxKSkuam9pbihwYWQpICsgbnVtYmVyXG4gIHJldHVybiBudW1iZXIgKyAnJ1xufVxuIixudWxsLCIvLyBodHRwOi8vd2lraS5jb21tb25qcy5vcmcvd2lraS9Vbml0X1Rlc3RpbmcvMS4wXG4vL1xuLy8gVEhJUyBJUyBOT1QgVEVTVEVEIE5PUiBMSUtFTFkgVE8gV09SSyBPVVRTSURFIFY4IVxuLy9cbi8vIE9yaWdpbmFsbHkgZnJvbSBuYXJ3aGFsLmpzIChodHRwOi8vbmFyd2hhbGpzLm9yZylcbi8vIENvcHlyaWdodCAoYykgMjAwOSBUaG9tYXMgUm9iaW5zb24gPDI4MG5vcnRoLmNvbT5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYSBjb3B5XG4vLyBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZSAnU29mdHdhcmUnKSwgdG9cbi8vIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZyB3aXRob3V0IGxpbWl0YXRpb24gdGhlXG4vLyByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLCBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Jcbi8vIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdCBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzXG4vLyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkIGluXG4vLyBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgJ0FTIElTJywgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTUyBPUlxuLy8gSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFksXG4vLyBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTiBOTyBFVkVOVCBTSEFMTCBUSEVcbi8vIEFVVEhPUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOXG4vLyBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1IgT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OXG4vLyBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEUgVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxuLy8gd2hlbiB1c2VkIGluIG5vZGUsIHRoaXMgd2lsbCBhY3R1YWxseSBsb2FkIHRoZSB1dGlsIG1vZHVsZSB3ZSBkZXBlbmQgb25cbi8vIHZlcnN1cyBsb2FkaW5nIHRoZSBidWlsdGluIHV0aWwgbW9kdWxlIGFzIGhhcHBlbnMgb3RoZXJ3aXNlXG4vLyB0aGlzIGlzIGEgYnVnIGluIG5vZGUgbW9kdWxlIGxvYWRpbmcgYXMgZmFyIGFzIEkgYW0gY29uY2VybmVkXG52YXIgdXRpbCA9IHJlcXVpcmUoJ3V0aWwvJyk7XG5cbnZhciBwU2xpY2UgPSBBcnJheS5wcm90b3R5cGUuc2xpY2U7XG52YXIgaGFzT3duID0gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eTtcblxuLy8gMS4gVGhlIGFzc2VydCBtb2R1bGUgcHJvdmlkZXMgZnVuY3Rpb25zIHRoYXQgdGhyb3dcbi8vIEFzc2VydGlvbkVycm9yJ3Mgd2hlbiBwYXJ0aWN1bGFyIGNvbmRpdGlvbnMgYXJlIG5vdCBtZXQuIFRoZVxuLy8gYXNzZXJ0IG1vZHVsZSBtdXN0IGNvbmZvcm0gdG8gdGhlIGZvbGxvd2luZyBpbnRlcmZhY2UuXG5cbnZhciBhc3NlcnQgPSBtb2R1bGUuZXhwb3J0cyA9IG9rO1xuXG4vLyAyLiBUaGUgQXNzZXJ0aW9uRXJyb3IgaXMgZGVmaW5lZCBpbiBhc3NlcnQuXG4vLyBuZXcgYXNzZXJ0LkFzc2VydGlvbkVycm9yKHsgbWVzc2FnZTogbWVzc2FnZSxcbi8vICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhY3R1YWw6IGFjdHVhbCxcbi8vICAgICAgICAgICAgICAgICAgICAgICAgICAgICBleHBlY3RlZDogZXhwZWN0ZWQgfSlcblxuYXNzZXJ0LkFzc2VydGlvbkVycm9yID0gZnVuY3Rpb24gQXNzZXJ0aW9uRXJyb3Iob3B0aW9ucykge1xuICB0aGlzLm5hbWUgPSAnQXNzZXJ0aW9uRXJyb3InO1xuICB0aGlzLmFjdHVhbCA9IG9wdGlvbnMuYWN0dWFsO1xuICB0aGlzLmV4cGVjdGVkID0gb3B0aW9ucy5leHBlY3RlZDtcbiAgdGhpcy5vcGVyYXRvciA9IG9wdGlvbnMub3BlcmF0b3I7XG4gIGlmIChvcHRpb25zLm1lc3NhZ2UpIHtcbiAgICB0aGlzLm1lc3NhZ2UgPSBvcHRpb25zLm1lc3NhZ2U7XG4gICAgdGhpcy5nZW5lcmF0ZWRNZXNzYWdlID0gZmFsc2U7XG4gIH0gZWxzZSB7XG4gICAgdGhpcy5tZXNzYWdlID0gZ2V0TWVzc2FnZSh0aGlzKTtcbiAgICB0aGlzLmdlbmVyYXRlZE1lc3NhZ2UgPSB0cnVlO1xuICB9XG4gIHZhciBzdGFja1N0YXJ0RnVuY3Rpb24gPSBvcHRpb25zLnN0YWNrU3RhcnRGdW5jdGlvbiB8fCBmYWlsO1xuXG4gIGlmIChFcnJvci5jYXB0dXJlU3RhY2tUcmFjZSkge1xuICAgIEVycm9yLmNhcHR1cmVTdGFja1RyYWNlKHRoaXMsIHN0YWNrU3RhcnRGdW5jdGlvbik7XG4gIH1cbiAgZWxzZSB7XG4gICAgLy8gbm9uIHY4IGJyb3dzZXJzIHNvIHdlIGNhbiBoYXZlIGEgc3RhY2t0cmFjZVxuICAgIHZhciBlcnIgPSBuZXcgRXJyb3IoKTtcbiAgICBpZiAoZXJyLnN0YWNrKSB7XG4gICAgICB2YXIgb3V0ID0gZXJyLnN0YWNrO1xuXG4gICAgICAvLyB0cnkgdG8gc3RyaXAgdXNlbGVzcyBmcmFtZXNcbiAgICAgIHZhciBmbl9uYW1lID0gc3RhY2tTdGFydEZ1bmN0aW9uLm5hbWU7XG4gICAgICB2YXIgaWR4ID0gb3V0LmluZGV4T2YoJ1xcbicgKyBmbl9uYW1lKTtcbiAgICAgIGlmIChpZHggPj0gMCkge1xuICAgICAgICAvLyBvbmNlIHdlIGhhdmUgbG9jYXRlZCB0aGUgZnVuY3Rpb24gZnJhbWVcbiAgICAgICAgLy8gd2UgbmVlZCB0byBzdHJpcCBvdXQgZXZlcnl0aGluZyBiZWZvcmUgaXQgKGFuZCBpdHMgbGluZSlcbiAgICAgICAgdmFyIG5leHRfbGluZSA9IG91dC5pbmRleE9mKCdcXG4nLCBpZHggKyAxKTtcbiAgICAgICAgb3V0ID0gb3V0LnN1YnN0cmluZyhuZXh0X2xpbmUgKyAxKTtcbiAgICAgIH1cblxuICAgICAgdGhpcy5zdGFjayA9IG91dDtcbiAgICB9XG4gIH1cbn07XG5cbi8vIGFzc2VydC5Bc3NlcnRpb25FcnJvciBpbnN0YW5jZW9mIEVycm9yXG51dGlsLmluaGVyaXRzKGFzc2VydC5Bc3NlcnRpb25FcnJvciwgRXJyb3IpO1xuXG5mdW5jdGlvbiByZXBsYWNlcihrZXksIHZhbHVlKSB7XG4gIGlmICh1dGlsLmlzVW5kZWZpbmVkKHZhbHVlKSkge1xuICAgIHJldHVybiAnJyArIHZhbHVlO1xuICB9XG4gIGlmICh1dGlsLmlzTnVtYmVyKHZhbHVlKSAmJiAhaXNGaW5pdGUodmFsdWUpKSB7XG4gICAgcmV0dXJuIHZhbHVlLnRvU3RyaW5nKCk7XG4gIH1cbiAgaWYgKHV0aWwuaXNGdW5jdGlvbih2YWx1ZSkgfHwgdXRpbC5pc1JlZ0V4cCh2YWx1ZSkpIHtcbiAgICByZXR1cm4gdmFsdWUudG9TdHJpbmcoKTtcbiAgfVxuICByZXR1cm4gdmFsdWU7XG59XG5cbmZ1bmN0aW9uIHRydW5jYXRlKHMsIG4pIHtcbiAgaWYgKHV0aWwuaXNTdHJpbmcocykpIHtcbiAgICByZXR1cm4gcy5sZW5ndGggPCBuID8gcyA6IHMuc2xpY2UoMCwgbik7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIHM7XG4gIH1cbn1cblxuZnVuY3Rpb24gZ2V0TWVzc2FnZShzZWxmKSB7XG4gIHJldHVybiB0cnVuY2F0ZShKU09OLnN0cmluZ2lmeShzZWxmLmFjdHVhbCwgcmVwbGFjZXIpLCAxMjgpICsgJyAnICtcbiAgICAgICAgIHNlbGYub3BlcmF0b3IgKyAnICcgK1xuICAgICAgICAgdHJ1bmNhdGUoSlNPTi5zdHJpbmdpZnkoc2VsZi5leHBlY3RlZCwgcmVwbGFjZXIpLCAxMjgpO1xufVxuXG4vLyBBdCBwcmVzZW50IG9ubHkgdGhlIHRocmVlIGtleXMgbWVudGlvbmVkIGFib3ZlIGFyZSB1c2VkIGFuZFxuLy8gdW5kZXJzdG9vZCBieSB0aGUgc3BlYy4gSW1wbGVtZW50YXRpb25zIG9yIHN1YiBtb2R1bGVzIGNhbiBwYXNzXG4vLyBvdGhlciBrZXlzIHRvIHRoZSBBc3NlcnRpb25FcnJvcidzIGNvbnN0cnVjdG9yIC0gdGhleSB3aWxsIGJlXG4vLyBpZ25vcmVkLlxuXG4vLyAzLiBBbGwgb2YgdGhlIGZvbGxvd2luZyBmdW5jdGlvbnMgbXVzdCB0aHJvdyBhbiBBc3NlcnRpb25FcnJvclxuLy8gd2hlbiBhIGNvcnJlc3BvbmRpbmcgY29uZGl0aW9uIGlzIG5vdCBtZXQsIHdpdGggYSBtZXNzYWdlIHRoYXRcbi8vIG1heSBiZSB1bmRlZmluZWQgaWYgbm90IHByb3ZpZGVkLiAgQWxsIGFzc2VydGlvbiBtZXRob2RzIHByb3ZpZGVcbi8vIGJvdGggdGhlIGFjdHVhbCBhbmQgZXhwZWN0ZWQgdmFsdWVzIHRvIHRoZSBhc3NlcnRpb24gZXJyb3IgZm9yXG4vLyBkaXNwbGF5IHB1cnBvc2VzLlxuXG5mdW5jdGlvbiBmYWlsKGFjdHVhbCwgZXhwZWN0ZWQsIG1lc3NhZ2UsIG9wZXJhdG9yLCBzdGFja1N0YXJ0RnVuY3Rpb24pIHtcbiAgdGhyb3cgbmV3IGFzc2VydC5Bc3NlcnRpb25FcnJvcih7XG4gICAgbWVzc2FnZTogbWVzc2FnZSxcbiAgICBhY3R1YWw6IGFjdHVhbCxcbiAgICBleHBlY3RlZDogZXhwZWN0ZWQsXG4gICAgb3BlcmF0b3I6IG9wZXJhdG9yLFxuICAgIHN0YWNrU3RhcnRGdW5jdGlvbjogc3RhY2tTdGFydEZ1bmN0aW9uXG4gIH0pO1xufVxuXG4vLyBFWFRFTlNJT04hIGFsbG93cyBmb3Igd2VsbCBiZWhhdmVkIGVycm9ycyBkZWZpbmVkIGVsc2V3aGVyZS5cbmFzc2VydC5mYWlsID0gZmFpbDtcblxuLy8gNC4gUHVyZSBhc3NlcnRpb24gdGVzdHMgd2hldGhlciBhIHZhbHVlIGlzIHRydXRoeSwgYXMgZGV0ZXJtaW5lZFxuLy8gYnkgISFndWFyZC5cbi8vIGFzc2VydC5vayhndWFyZCwgbWVzc2FnZV9vcHQpO1xuLy8gVGhpcyBzdGF0ZW1lbnQgaXMgZXF1aXZhbGVudCB0byBhc3NlcnQuZXF1YWwodHJ1ZSwgISFndWFyZCxcbi8vIG1lc3NhZ2Vfb3B0KTsuIFRvIHRlc3Qgc3RyaWN0bHkgZm9yIHRoZSB2YWx1ZSB0cnVlLCB1c2Vcbi8vIGFzc2VydC5zdHJpY3RFcXVhbCh0cnVlLCBndWFyZCwgbWVzc2FnZV9vcHQpOy5cblxuZnVuY3Rpb24gb2sodmFsdWUsIG1lc3NhZ2UpIHtcbiAgaWYgKCF2YWx1ZSkgZmFpbCh2YWx1ZSwgdHJ1ZSwgbWVzc2FnZSwgJz09JywgYXNzZXJ0Lm9rKTtcbn1cbmFzc2VydC5vayA9IG9rO1xuXG4vLyA1LiBUaGUgZXF1YWxpdHkgYXNzZXJ0aW9uIHRlc3RzIHNoYWxsb3csIGNvZXJjaXZlIGVxdWFsaXR5IHdpdGhcbi8vID09LlxuLy8gYXNzZXJ0LmVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQsIG1lc3NhZ2Vfb3B0KTtcblxuYXNzZXJ0LmVxdWFsID0gZnVuY3Rpb24gZXF1YWwoYWN0dWFsLCBleHBlY3RlZCwgbWVzc2FnZSkge1xuICBpZiAoYWN0dWFsICE9IGV4cGVjdGVkKSBmYWlsKGFjdHVhbCwgZXhwZWN0ZWQsIG1lc3NhZ2UsICc9PScsIGFzc2VydC5lcXVhbCk7XG59O1xuXG4vLyA2LiBUaGUgbm9uLWVxdWFsaXR5IGFzc2VydGlvbiB0ZXN0cyBmb3Igd2hldGhlciB0d28gb2JqZWN0cyBhcmUgbm90IGVxdWFsXG4vLyB3aXRoICE9IGFzc2VydC5ub3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkLCBtZXNzYWdlX29wdCk7XG5cbmFzc2VydC5ub3RFcXVhbCA9IGZ1bmN0aW9uIG5vdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQsIG1lc3NhZ2UpIHtcbiAgaWYgKGFjdHVhbCA9PSBleHBlY3RlZCkge1xuICAgIGZhaWwoYWN0dWFsLCBleHBlY3RlZCwgbWVzc2FnZSwgJyE9JywgYXNzZXJ0Lm5vdEVxdWFsKTtcbiAgfVxufTtcblxuLy8gNy4gVGhlIGVxdWl2YWxlbmNlIGFzc2VydGlvbiB0ZXN0cyBhIGRlZXAgZXF1YWxpdHkgcmVsYXRpb24uXG4vLyBhc3NlcnQuZGVlcEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQsIG1lc3NhZ2Vfb3B0KTtcblxuYXNzZXJ0LmRlZXBFcXVhbCA9IGZ1bmN0aW9uIGRlZXBFcXVhbChhY3R1YWwsIGV4cGVjdGVkLCBtZXNzYWdlKSB7XG4gIGlmICghX2RlZXBFcXVhbChhY3R1YWwsIGV4cGVjdGVkKSkge1xuICAgIGZhaWwoYWN0dWFsLCBleHBlY3RlZCwgbWVzc2FnZSwgJ2RlZXBFcXVhbCcsIGFzc2VydC5kZWVwRXF1YWwpO1xuICB9XG59O1xuXG5mdW5jdGlvbiBfZGVlcEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQpIHtcbiAgLy8gNy4xLiBBbGwgaWRlbnRpY2FsIHZhbHVlcyBhcmUgZXF1aXZhbGVudCwgYXMgZGV0ZXJtaW5lZCBieSA9PT0uXG4gIGlmIChhY3R1YWwgPT09IGV4cGVjdGVkKSB7XG4gICAgcmV0dXJuIHRydWU7XG5cbiAgfSBlbHNlIGlmICh1dGlsLmlzQnVmZmVyKGFjdHVhbCkgJiYgdXRpbC5pc0J1ZmZlcihleHBlY3RlZCkpIHtcbiAgICBpZiAoYWN0dWFsLmxlbmd0aCAhPSBleHBlY3RlZC5sZW5ndGgpIHJldHVybiBmYWxzZTtcblxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYWN0dWFsLmxlbmd0aDsgaSsrKSB7XG4gICAgICBpZiAoYWN0dWFsW2ldICE9PSBleHBlY3RlZFtpXSkgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIHJldHVybiB0cnVlO1xuXG4gIC8vIDcuMi4gSWYgdGhlIGV4cGVjdGVkIHZhbHVlIGlzIGEgRGF0ZSBvYmplY3QsIHRoZSBhY3R1YWwgdmFsdWUgaXNcbiAgLy8gZXF1aXZhbGVudCBpZiBpdCBpcyBhbHNvIGEgRGF0ZSBvYmplY3QgdGhhdCByZWZlcnMgdG8gdGhlIHNhbWUgdGltZS5cbiAgfSBlbHNlIGlmICh1dGlsLmlzRGF0ZShhY3R1YWwpICYmIHV0aWwuaXNEYXRlKGV4cGVjdGVkKSkge1xuICAgIHJldHVybiBhY3R1YWwuZ2V0VGltZSgpID09PSBleHBlY3RlZC5nZXRUaW1lKCk7XG5cbiAgLy8gNy4zIElmIHRoZSBleHBlY3RlZCB2YWx1ZSBpcyBhIFJlZ0V4cCBvYmplY3QsIHRoZSBhY3R1YWwgdmFsdWUgaXNcbiAgLy8gZXF1aXZhbGVudCBpZiBpdCBpcyBhbHNvIGEgUmVnRXhwIG9iamVjdCB3aXRoIHRoZSBzYW1lIHNvdXJjZSBhbmRcbiAgLy8gcHJvcGVydGllcyAoYGdsb2JhbGAsIGBtdWx0aWxpbmVgLCBgbGFzdEluZGV4YCwgYGlnbm9yZUNhc2VgKS5cbiAgfSBlbHNlIGlmICh1dGlsLmlzUmVnRXhwKGFjdHVhbCkgJiYgdXRpbC5pc1JlZ0V4cChleHBlY3RlZCkpIHtcbiAgICByZXR1cm4gYWN0dWFsLnNvdXJjZSA9PT0gZXhwZWN0ZWQuc291cmNlICYmXG4gICAgICAgICAgIGFjdHVhbC5nbG9iYWwgPT09IGV4cGVjdGVkLmdsb2JhbCAmJlxuICAgICAgICAgICBhY3R1YWwubXVsdGlsaW5lID09PSBleHBlY3RlZC5tdWx0aWxpbmUgJiZcbiAgICAgICAgICAgYWN0dWFsLmxhc3RJbmRleCA9PT0gZXhwZWN0ZWQubGFzdEluZGV4ICYmXG4gICAgICAgICAgIGFjdHVhbC5pZ25vcmVDYXNlID09PSBleHBlY3RlZC5pZ25vcmVDYXNlO1xuXG4gIC8vIDcuNC4gT3RoZXIgcGFpcnMgdGhhdCBkbyBub3QgYm90aCBwYXNzIHR5cGVvZiB2YWx1ZSA9PSAnb2JqZWN0JyxcbiAgLy8gZXF1aXZhbGVuY2UgaXMgZGV0ZXJtaW5lZCBieSA9PS5cbiAgfSBlbHNlIGlmICghdXRpbC5pc09iamVjdChhY3R1YWwpICYmICF1dGlsLmlzT2JqZWN0KGV4cGVjdGVkKSkge1xuICAgIHJldHVybiBhY3R1YWwgPT0gZXhwZWN0ZWQ7XG5cbiAgLy8gNy41IEZvciBhbGwgb3RoZXIgT2JqZWN0IHBhaXJzLCBpbmNsdWRpbmcgQXJyYXkgb2JqZWN0cywgZXF1aXZhbGVuY2UgaXNcbiAgLy8gZGV0ZXJtaW5lZCBieSBoYXZpbmcgdGhlIHNhbWUgbnVtYmVyIG9mIG93bmVkIHByb3BlcnRpZXMgKGFzIHZlcmlmaWVkXG4gIC8vIHdpdGggT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKSwgdGhlIHNhbWUgc2V0IG9mIGtleXNcbiAgLy8gKGFsdGhvdWdoIG5vdCBuZWNlc3NhcmlseSB0aGUgc2FtZSBvcmRlciksIGVxdWl2YWxlbnQgdmFsdWVzIGZvciBldmVyeVxuICAvLyBjb3JyZXNwb25kaW5nIGtleSwgYW5kIGFuIGlkZW50aWNhbCAncHJvdG90eXBlJyBwcm9wZXJ0eS4gTm90ZTogdGhpc1xuICAvLyBhY2NvdW50cyBmb3IgYm90aCBuYW1lZCBhbmQgaW5kZXhlZCBwcm9wZXJ0aWVzIG9uIEFycmF5cy5cbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gb2JqRXF1aXYoYWN0dWFsLCBleHBlY3RlZCk7XG4gIH1cbn1cblxuZnVuY3Rpb24gaXNBcmd1bWVudHMob2JqZWN0KSB7XG4gIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwob2JqZWN0KSA9PSAnW29iamVjdCBBcmd1bWVudHNdJztcbn1cblxuZnVuY3Rpb24gb2JqRXF1aXYoYSwgYikge1xuICBpZiAodXRpbC5pc051bGxPclVuZGVmaW5lZChhKSB8fCB1dGlsLmlzTnVsbE9yVW5kZWZpbmVkKGIpKVxuICAgIHJldHVybiBmYWxzZTtcbiAgLy8gYW4gaWRlbnRpY2FsICdwcm90b3R5cGUnIHByb3BlcnR5LlxuICBpZiAoYS5wcm90b3R5cGUgIT09IGIucHJvdG90eXBlKSByZXR1cm4gZmFsc2U7XG4gIC8vIGlmIG9uZSBpcyBhIHByaW1pdGl2ZSwgdGhlIG90aGVyIG11c3QgYmUgc2FtZVxuICBpZiAodXRpbC5pc1ByaW1pdGl2ZShhKSB8fCB1dGlsLmlzUHJpbWl0aXZlKGIpKSB7XG4gICAgcmV0dXJuIGEgPT09IGI7XG4gIH1cbiAgdmFyIGFJc0FyZ3MgPSBpc0FyZ3VtZW50cyhhKSxcbiAgICAgIGJJc0FyZ3MgPSBpc0FyZ3VtZW50cyhiKTtcbiAgaWYgKChhSXNBcmdzICYmICFiSXNBcmdzKSB8fCAoIWFJc0FyZ3MgJiYgYklzQXJncykpXG4gICAgcmV0dXJuIGZhbHNlO1xuICBpZiAoYUlzQXJncykge1xuICAgIGEgPSBwU2xpY2UuY2FsbChhKTtcbiAgICBiID0gcFNsaWNlLmNhbGwoYik7XG4gICAgcmV0dXJuIF9kZWVwRXF1YWwoYSwgYik7XG4gIH1cbiAgdmFyIGthID0gb2JqZWN0S2V5cyhhKSxcbiAgICAgIGtiID0gb2JqZWN0S2V5cyhiKSxcbiAgICAgIGtleSwgaTtcbiAgLy8gaGF2aW5nIHRoZSBzYW1lIG51bWJlciBvZiBvd25lZCBwcm9wZXJ0aWVzIChrZXlzIGluY29ycG9yYXRlc1xuICAvLyBoYXNPd25Qcm9wZXJ0eSlcbiAgaWYgKGthLmxlbmd0aCAhPSBrYi5sZW5ndGgpXG4gICAgcmV0dXJuIGZhbHNlO1xuICAvL3RoZSBzYW1lIHNldCBvZiBrZXlzIChhbHRob3VnaCBub3QgbmVjZXNzYXJpbHkgdGhlIHNhbWUgb3JkZXIpLFxuICBrYS5zb3J0KCk7XG4gIGtiLnNvcnQoKTtcbiAgLy9+fn5jaGVhcCBrZXkgdGVzdFxuICBmb3IgKGkgPSBrYS5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgIGlmIChrYVtpXSAhPSBrYltpXSlcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICAvL2VxdWl2YWxlbnQgdmFsdWVzIGZvciBldmVyeSBjb3JyZXNwb25kaW5nIGtleSwgYW5kXG4gIC8vfn5+cG9zc2libHkgZXhwZW5zaXZlIGRlZXAgdGVzdFxuICBmb3IgKGkgPSBrYS5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgIGtleSA9IGthW2ldO1xuICAgIGlmICghX2RlZXBFcXVhbChhW2tleV0sIGJba2V5XSkpIHJldHVybiBmYWxzZTtcbiAgfVxuICByZXR1cm4gdHJ1ZTtcbn1cblxuLy8gOC4gVGhlIG5vbi1lcXVpdmFsZW5jZSBhc3NlcnRpb24gdGVzdHMgZm9yIGFueSBkZWVwIGluZXF1YWxpdHkuXG4vLyBhc3NlcnQubm90RGVlcEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQsIG1lc3NhZ2Vfb3B0KTtcblxuYXNzZXJ0Lm5vdERlZXBFcXVhbCA9IGZ1bmN0aW9uIG5vdERlZXBFcXVhbChhY3R1YWwsIGV4cGVjdGVkLCBtZXNzYWdlKSB7XG4gIGlmIChfZGVlcEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQpKSB7XG4gICAgZmFpbChhY3R1YWwsIGV4cGVjdGVkLCBtZXNzYWdlLCAnbm90RGVlcEVxdWFsJywgYXNzZXJ0Lm5vdERlZXBFcXVhbCk7XG4gIH1cbn07XG5cbi8vIDkuIFRoZSBzdHJpY3QgZXF1YWxpdHkgYXNzZXJ0aW9uIHRlc3RzIHN0cmljdCBlcXVhbGl0eSwgYXMgZGV0ZXJtaW5lZCBieSA9PT0uXG4vLyBhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCwgbWVzc2FnZV9vcHQpO1xuXG5hc3NlcnQuc3RyaWN0RXF1YWwgPSBmdW5jdGlvbiBzdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkLCBtZXNzYWdlKSB7XG4gIGlmIChhY3R1YWwgIT09IGV4cGVjdGVkKSB7XG4gICAgZmFpbChhY3R1YWwsIGV4cGVjdGVkLCBtZXNzYWdlLCAnPT09JywgYXNzZXJ0LnN0cmljdEVxdWFsKTtcbiAgfVxufTtcblxuLy8gMTAuIFRoZSBzdHJpY3Qgbm9uLWVxdWFsaXR5IGFzc2VydGlvbiB0ZXN0cyBmb3Igc3RyaWN0IGluZXF1YWxpdHksIGFzXG4vLyBkZXRlcm1pbmVkIGJ5ICE9PS4gIGFzc2VydC5ub3RTdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkLCBtZXNzYWdlX29wdCk7XG5cbmFzc2VydC5ub3RTdHJpY3RFcXVhbCA9IGZ1bmN0aW9uIG5vdFN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQsIG1lc3NhZ2UpIHtcbiAgaWYgKGFjdHVhbCA9PT0gZXhwZWN0ZWQpIHtcbiAgICBmYWlsKGFjdHVhbCwgZXhwZWN0ZWQsIG1lc3NhZ2UsICchPT0nLCBhc3NlcnQubm90U3RyaWN0RXF1YWwpO1xuICB9XG59O1xuXG5mdW5jdGlvbiBleHBlY3RlZEV4Y2VwdGlvbihhY3R1YWwsIGV4cGVjdGVkKSB7XG4gIGlmICghYWN0dWFsIHx8ICFleHBlY3RlZCkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGlmIChPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoZXhwZWN0ZWQpID09ICdbb2JqZWN0IFJlZ0V4cF0nKSB7XG4gICAgcmV0dXJuIGV4cGVjdGVkLnRlc3QoYWN0dWFsKTtcbiAgfSBlbHNlIGlmIChhY3R1YWwgaW5zdGFuY2VvZiBleHBlY3RlZCkge1xuICAgIHJldHVybiB0cnVlO1xuICB9IGVsc2UgaWYgKGV4cGVjdGVkLmNhbGwoe30sIGFjdHVhbCkgPT09IHRydWUpIHtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIHJldHVybiBmYWxzZTtcbn1cblxuZnVuY3Rpb24gX3Rocm93cyhzaG91bGRUaHJvdywgYmxvY2ssIGV4cGVjdGVkLCBtZXNzYWdlKSB7XG4gIHZhciBhY3R1YWw7XG5cbiAgaWYgKHV0aWwuaXNTdHJpbmcoZXhwZWN0ZWQpKSB7XG4gICAgbWVzc2FnZSA9IGV4cGVjdGVkO1xuICAgIGV4cGVjdGVkID0gbnVsbDtcbiAgfVxuXG4gIHRyeSB7XG4gICAgYmxvY2soKTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIGFjdHVhbCA9IGU7XG4gIH1cblxuICBtZXNzYWdlID0gKGV4cGVjdGVkICYmIGV4cGVjdGVkLm5hbWUgPyAnICgnICsgZXhwZWN0ZWQubmFtZSArICcpLicgOiAnLicpICtcbiAgICAgICAgICAgIChtZXNzYWdlID8gJyAnICsgbWVzc2FnZSA6ICcuJyk7XG5cbiAgaWYgKHNob3VsZFRocm93ICYmICFhY3R1YWwpIHtcbiAgICBmYWlsKGFjdHVhbCwgZXhwZWN0ZWQsICdNaXNzaW5nIGV4cGVjdGVkIGV4Y2VwdGlvbicgKyBtZXNzYWdlKTtcbiAgfVxuXG4gIGlmICghc2hvdWxkVGhyb3cgJiYgZXhwZWN0ZWRFeGNlcHRpb24oYWN0dWFsLCBleHBlY3RlZCkpIHtcbiAgICBmYWlsKGFjdHVhbCwgZXhwZWN0ZWQsICdHb3QgdW53YW50ZWQgZXhjZXB0aW9uJyArIG1lc3NhZ2UpO1xuICB9XG5cbiAgaWYgKChzaG91bGRUaHJvdyAmJiBhY3R1YWwgJiYgZXhwZWN0ZWQgJiZcbiAgICAgICFleHBlY3RlZEV4Y2VwdGlvbihhY3R1YWwsIGV4cGVjdGVkKSkgfHwgKCFzaG91bGRUaHJvdyAmJiBhY3R1YWwpKSB7XG4gICAgdGhyb3cgYWN0dWFsO1xuICB9XG59XG5cbi8vIDExLiBFeHBlY3RlZCB0byB0aHJvdyBhbiBlcnJvcjpcbi8vIGFzc2VydC50aHJvd3MoYmxvY2ssIEVycm9yX29wdCwgbWVzc2FnZV9vcHQpO1xuXG5hc3NlcnQudGhyb3dzID0gZnVuY3Rpb24oYmxvY2ssIC8qb3B0aW9uYWwqL2Vycm9yLCAvKm9wdGlvbmFsKi9tZXNzYWdlKSB7XG4gIF90aHJvd3MuYXBwbHkodGhpcywgW3RydWVdLmNvbmNhdChwU2xpY2UuY2FsbChhcmd1bWVudHMpKSk7XG59O1xuXG4vLyBFWFRFTlNJT04hIFRoaXMgaXMgYW5ub3lpbmcgdG8gd3JpdGUgb3V0c2lkZSB0aGlzIG1vZHVsZS5cbmFzc2VydC5kb2VzTm90VGhyb3cgPSBmdW5jdGlvbihibG9jaywgLypvcHRpb25hbCovbWVzc2FnZSkge1xuICBfdGhyb3dzLmFwcGx5KHRoaXMsIFtmYWxzZV0uY29uY2F0KHBTbGljZS5jYWxsKGFyZ3VtZW50cykpKTtcbn07XG5cbmFzc2VydC5pZkVycm9yID0gZnVuY3Rpb24oZXJyKSB7IGlmIChlcnIpIHt0aHJvdyBlcnI7fX07XG5cbnZhciBvYmplY3RLZXlzID0gT2JqZWN0LmtleXMgfHwgZnVuY3Rpb24gKG9iaikge1xuICB2YXIga2V5cyA9IFtdO1xuICBmb3IgKHZhciBrZXkgaW4gb2JqKSB7XG4gICAgaWYgKGhhc093bi5jYWxsKG9iaiwga2V5KSkga2V5cy5wdXNoKGtleSk7XG4gIH1cbiAgcmV0dXJuIGtleXM7XG59O1xuIiwiLyohXG4gKiBUaGUgYnVmZmVyIG1vZHVsZSBmcm9tIG5vZGUuanMsIGZvciB0aGUgYnJvd3Nlci5cbiAqXG4gKiBAYXV0aG9yICAgRmVyb3NzIEFib3VraGFkaWplaCA8ZmVyb3NzQGZlcm9zcy5vcmc+IDxodHRwOi8vZmVyb3NzLm9yZz5cbiAqIEBsaWNlbnNlICBNSVRcbiAqL1xuXG52YXIgYmFzZTY0ID0gcmVxdWlyZSgnYmFzZTY0LWpzJylcbnZhciBpZWVlNzU0ID0gcmVxdWlyZSgnaWVlZTc1NCcpXG52YXIgaXNBcnJheSA9IHJlcXVpcmUoJ2lzLWFycmF5JylcblxuZXhwb3J0cy5CdWZmZXIgPSBCdWZmZXJcbmV4cG9ydHMuU2xvd0J1ZmZlciA9IFNsb3dCdWZmZXJcbmV4cG9ydHMuSU5TUEVDVF9NQVhfQllURVMgPSA1MFxuQnVmZmVyLnBvb2xTaXplID0gODE5MiAvLyBub3QgdXNlZCBieSB0aGlzIGltcGxlbWVudGF0aW9uXG5cbnZhciBrTWF4TGVuZ3RoID0gMHgzZmZmZmZmZlxudmFyIHJvb3RQYXJlbnQgPSB7fVxuXG4vKipcbiAqIElmIGBCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVGA6XG4gKiAgID09PSB0cnVlICAgIFVzZSBVaW50OEFycmF5IGltcGxlbWVudGF0aW9uIChmYXN0ZXN0KVxuICogICA9PT0gZmFsc2UgICBVc2UgT2JqZWN0IGltcGxlbWVudGF0aW9uIChtb3N0IGNvbXBhdGlibGUsIGV2ZW4gSUU2KVxuICpcbiAqIEJyb3dzZXJzIHRoYXQgc3VwcG9ydCB0eXBlZCBhcnJheXMgYXJlIElFIDEwKywgRmlyZWZveCA0KywgQ2hyb21lIDcrLCBTYWZhcmkgNS4xKyxcbiAqIE9wZXJhIDExLjYrLCBpT1MgNC4yKy5cbiAqXG4gKiBOb3RlOlxuICpcbiAqIC0gSW1wbGVtZW50YXRpb24gbXVzdCBzdXBwb3J0IGFkZGluZyBuZXcgcHJvcGVydGllcyB0byBgVWludDhBcnJheWAgaW5zdGFuY2VzLlxuICogICBGaXJlZm94IDQtMjkgbGFja2VkIHN1cHBvcnQsIGZpeGVkIGluIEZpcmVmb3ggMzArLlxuICogICBTZWU6IGh0dHBzOi8vYnVnemlsbGEubW96aWxsYS5vcmcvc2hvd19idWcuY2dpP2lkPTY5NTQzOC5cbiAqXG4gKiAgLSBDaHJvbWUgOS0xMCBpcyBtaXNzaW5nIHRoZSBgVHlwZWRBcnJheS5wcm90b3R5cGUuc3ViYXJyYXlgIGZ1bmN0aW9uLlxuICpcbiAqICAtIElFMTAgaGFzIGEgYnJva2VuIGBUeXBlZEFycmF5LnByb3RvdHlwZS5zdWJhcnJheWAgZnVuY3Rpb24gd2hpY2ggcmV0dXJucyBhcnJheXMgb2ZcbiAqICAgIGluY29ycmVjdCBsZW5ndGggaW4gc29tZSBzaXR1YXRpb25zLlxuICpcbiAqIFdlIGRldGVjdCB0aGVzZSBidWdneSBicm93c2VycyBhbmQgc2V0IGBCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVGAgdG8gYGZhbHNlYCBzbyB0aGV5IHdpbGxcbiAqIGdldCB0aGUgT2JqZWN0IGltcGxlbWVudGF0aW9uLCB3aGljaCBpcyBzbG93ZXIgYnV0IHdpbGwgd29yayBjb3JyZWN0bHkuXG4gKi9cbkJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUID0gKGZ1bmN0aW9uICgpIHtcbiAgdHJ5IHtcbiAgICB2YXIgYnVmID0gbmV3IEFycmF5QnVmZmVyKDApXG4gICAgdmFyIGFyciA9IG5ldyBVaW50OEFycmF5KGJ1ZilcbiAgICBhcnIuZm9vID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gNDIgfVxuICAgIHJldHVybiBhcnIuZm9vKCkgPT09IDQyICYmIC8vIHR5cGVkIGFycmF5IGluc3RhbmNlcyBjYW4gYmUgYXVnbWVudGVkXG4gICAgICAgIHR5cGVvZiBhcnIuc3ViYXJyYXkgPT09ICdmdW5jdGlvbicgJiYgLy8gY2hyb21lIDktMTAgbGFjayBgc3ViYXJyYXlgXG4gICAgICAgIG5ldyBVaW50OEFycmF5KDEpLnN1YmFycmF5KDEsIDEpLmJ5dGVMZW5ndGggPT09IDAgLy8gaWUxMCBoYXMgYnJva2VuIGBzdWJhcnJheWBcbiAgfSBjYXRjaCAoZSkge1xuICAgIHJldHVybiBmYWxzZVxuICB9XG59KSgpXG5cbi8qKlxuICogQ2xhc3M6IEJ1ZmZlclxuICogPT09PT09PT09PT09PVxuICpcbiAqIFRoZSBCdWZmZXIgY29uc3RydWN0b3IgcmV0dXJucyBpbnN0YW5jZXMgb2YgYFVpbnQ4QXJyYXlgIHRoYXQgYXJlIGF1Z21lbnRlZFxuICogd2l0aCBmdW5jdGlvbiBwcm9wZXJ0aWVzIGZvciBhbGwgdGhlIG5vZGUgYEJ1ZmZlcmAgQVBJIGZ1bmN0aW9ucy4gV2UgdXNlXG4gKiBgVWludDhBcnJheWAgc28gdGhhdCBzcXVhcmUgYnJhY2tldCBub3RhdGlvbiB3b3JrcyBhcyBleHBlY3RlZCAtLSBpdCByZXR1cm5zXG4gKiBhIHNpbmdsZSBvY3RldC5cbiAqXG4gKiBCeSBhdWdtZW50aW5nIHRoZSBpbnN0YW5jZXMsIHdlIGNhbiBhdm9pZCBtb2RpZnlpbmcgdGhlIGBVaW50OEFycmF5YFxuICogcHJvdG90eXBlLlxuICovXG5mdW5jdGlvbiBCdWZmZXIgKHN1YmplY3QsIGVuY29kaW5nKSB7XG4gIHZhciBzZWxmID0gdGhpc1xuICBpZiAoIShzZWxmIGluc3RhbmNlb2YgQnVmZmVyKSkgcmV0dXJuIG5ldyBCdWZmZXIoc3ViamVjdCwgZW5jb2RpbmcpXG5cbiAgdmFyIHR5cGUgPSB0eXBlb2Ygc3ViamVjdFxuICB2YXIgbGVuZ3RoXG5cbiAgaWYgKHR5cGUgPT09ICdudW1iZXInKSB7XG4gICAgbGVuZ3RoID0gK3N1YmplY3RcbiAgfSBlbHNlIGlmICh0eXBlID09PSAnc3RyaW5nJykge1xuICAgIGxlbmd0aCA9IEJ1ZmZlci5ieXRlTGVuZ3RoKHN1YmplY3QsIGVuY29kaW5nKVxuICB9IGVsc2UgaWYgKHR5cGUgPT09ICdvYmplY3QnICYmIHN1YmplY3QgIT09IG51bGwpIHtcbiAgICAvLyBhc3N1bWUgb2JqZWN0IGlzIGFycmF5LWxpa2VcbiAgICBpZiAoc3ViamVjdC50eXBlID09PSAnQnVmZmVyJyAmJiBpc0FycmF5KHN1YmplY3QuZGF0YSkpIHN1YmplY3QgPSBzdWJqZWN0LmRhdGFcbiAgICBsZW5ndGggPSArc3ViamVjdC5sZW5ndGhcbiAgfSBlbHNlIHtcbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdtdXN0IHN0YXJ0IHdpdGggbnVtYmVyLCBidWZmZXIsIGFycmF5IG9yIHN0cmluZycpXG4gIH1cblxuICBpZiAobGVuZ3RoID4ga01heExlbmd0aCkge1xuICAgIHRocm93IG5ldyBSYW5nZUVycm9yKCdBdHRlbXB0IHRvIGFsbG9jYXRlIEJ1ZmZlciBsYXJnZXIgdGhhbiBtYXhpbXVtIHNpemU6IDB4JyArXG4gICAgICBrTWF4TGVuZ3RoLnRvU3RyaW5nKDE2KSArICcgYnl0ZXMnKVxuICB9XG5cbiAgaWYgKGxlbmd0aCA8IDApIGxlbmd0aCA9IDBcbiAgZWxzZSBsZW5ndGggPj4+PSAwIC8vIGNvZXJjZSB0byB1aW50MzJcblxuICBpZiAoQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQpIHtcbiAgICAvLyBQcmVmZXJyZWQ6IFJldHVybiBhbiBhdWdtZW50ZWQgYFVpbnQ4QXJyYXlgIGluc3RhbmNlIGZvciBiZXN0IHBlcmZvcm1hbmNlXG4gICAgc2VsZiA9IEJ1ZmZlci5fYXVnbWVudChuZXcgVWludDhBcnJheShsZW5ndGgpKSAvLyBlc2xpbnQtZGlzYWJsZS1saW5lIGNvbnNpc3RlbnQtdGhpc1xuICB9IGVsc2Uge1xuICAgIC8vIEZhbGxiYWNrOiBSZXR1cm4gVEhJUyBpbnN0YW5jZSBvZiBCdWZmZXIgKGNyZWF0ZWQgYnkgYG5ld2ApXG4gICAgc2VsZi5sZW5ndGggPSBsZW5ndGhcbiAgICBzZWxmLl9pc0J1ZmZlciA9IHRydWVcbiAgfVxuXG4gIHZhciBpXG4gIGlmIChCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCAmJiB0eXBlb2Ygc3ViamVjdC5ieXRlTGVuZ3RoID09PSAnbnVtYmVyJykge1xuICAgIC8vIFNwZWVkIG9wdGltaXphdGlvbiAtLSB1c2Ugc2V0IGlmIHdlJ3JlIGNvcHlpbmcgZnJvbSBhIHR5cGVkIGFycmF5XG4gICAgc2VsZi5fc2V0KHN1YmplY3QpXG4gIH0gZWxzZSBpZiAoaXNBcnJheWlzaChzdWJqZWN0KSkge1xuICAgIC8vIFRyZWF0IGFycmF5LWlzaCBvYmplY3RzIGFzIGEgYnl0ZSBhcnJheVxuICAgIGlmIChCdWZmZXIuaXNCdWZmZXIoc3ViamVjdCkpIHtcbiAgICAgIGZvciAoaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgICBzZWxmW2ldID0gc3ViamVjdC5yZWFkVUludDgoaSlcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgZm9yIChpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHNlbGZbaV0gPSAoKHN1YmplY3RbaV0gJSAyNTYpICsgMjU2KSAlIDI1NlxuICAgICAgfVxuICAgIH1cbiAgfSBlbHNlIGlmICh0eXBlID09PSAnc3RyaW5nJykge1xuICAgIHNlbGYud3JpdGUoc3ViamVjdCwgMCwgZW5jb2RpbmcpXG4gIH0gZWxzZSBpZiAodHlwZSA9PT0gJ251bWJlcicgJiYgIUJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUKSB7XG4gICAgZm9yIChpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICBzZWxmW2ldID0gMFxuICAgIH1cbiAgfVxuXG4gIGlmIChsZW5ndGggPiAwICYmIGxlbmd0aCA8PSBCdWZmZXIucG9vbFNpemUpIHNlbGYucGFyZW50ID0gcm9vdFBhcmVudFxuXG4gIHJldHVybiBzZWxmXG59XG5cbmZ1bmN0aW9uIFNsb3dCdWZmZXIgKHN1YmplY3QsIGVuY29kaW5nKSB7XG4gIGlmICghKHRoaXMgaW5zdGFuY2VvZiBTbG93QnVmZmVyKSkgcmV0dXJuIG5ldyBTbG93QnVmZmVyKHN1YmplY3QsIGVuY29kaW5nKVxuXG4gIHZhciBidWYgPSBuZXcgQnVmZmVyKHN1YmplY3QsIGVuY29kaW5nKVxuICBkZWxldGUgYnVmLnBhcmVudFxuICByZXR1cm4gYnVmXG59XG5cbkJ1ZmZlci5pc0J1ZmZlciA9IGZ1bmN0aW9uIGlzQnVmZmVyIChiKSB7XG4gIHJldHVybiAhIShiICE9IG51bGwgJiYgYi5faXNCdWZmZXIpXG59XG5cbkJ1ZmZlci5jb21wYXJlID0gZnVuY3Rpb24gY29tcGFyZSAoYSwgYikge1xuICBpZiAoIUJ1ZmZlci5pc0J1ZmZlcihhKSB8fCAhQnVmZmVyLmlzQnVmZmVyKGIpKSB7XG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcignQXJndW1lbnRzIG11c3QgYmUgQnVmZmVycycpXG4gIH1cblxuICBpZiAoYSA9PT0gYikgcmV0dXJuIDBcblxuICB2YXIgeCA9IGEubGVuZ3RoXG4gIHZhciB5ID0gYi5sZW5ndGhcbiAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IE1hdGgubWluKHgsIHkpOyBpIDwgbGVuICYmIGFbaV0gPT09IGJbaV07IGkrKykge31cbiAgaWYgKGkgIT09IGxlbikge1xuICAgIHggPSBhW2ldXG4gICAgeSA9IGJbaV1cbiAgfVxuICBpZiAoeCA8IHkpIHJldHVybiAtMVxuICBpZiAoeSA8IHgpIHJldHVybiAxXG4gIHJldHVybiAwXG59XG5cbkJ1ZmZlci5pc0VuY29kaW5nID0gZnVuY3Rpb24gaXNFbmNvZGluZyAoZW5jb2RpbmcpIHtcbiAgc3dpdGNoIChTdHJpbmcoZW5jb2RpbmcpLnRvTG93ZXJDYXNlKCkpIHtcbiAgICBjYXNlICdoZXgnOlxuICAgIGNhc2UgJ3V0ZjgnOlxuICAgIGNhc2UgJ3V0Zi04JzpcbiAgICBjYXNlICdhc2NpaSc6XG4gICAgY2FzZSAnYmluYXJ5JzpcbiAgICBjYXNlICdiYXNlNjQnOlxuICAgIGNhc2UgJ3Jhdyc6XG4gICAgY2FzZSAndWNzMic6XG4gICAgY2FzZSAndWNzLTInOlxuICAgIGNhc2UgJ3V0ZjE2bGUnOlxuICAgIGNhc2UgJ3V0Zi0xNmxlJzpcbiAgICAgIHJldHVybiB0cnVlXG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiBmYWxzZVxuICB9XG59XG5cbkJ1ZmZlci5jb25jYXQgPSBmdW5jdGlvbiBjb25jYXQgKGxpc3QsIHRvdGFsTGVuZ3RoKSB7XG4gIGlmICghaXNBcnJheShsaXN0KSkgdGhyb3cgbmV3IFR5cGVFcnJvcignbGlzdCBhcmd1bWVudCBtdXN0IGJlIGFuIEFycmF5IG9mIEJ1ZmZlcnMuJylcblxuICBpZiAobGlzdC5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gbmV3IEJ1ZmZlcigwKVxuICB9IGVsc2UgaWYgKGxpc3QubGVuZ3RoID09PSAxKSB7XG4gICAgcmV0dXJuIGxpc3RbMF1cbiAgfVxuXG4gIHZhciBpXG4gIGlmICh0b3RhbExlbmd0aCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgdG90YWxMZW5ndGggPSAwXG4gICAgZm9yIChpID0gMDsgaSA8IGxpc3QubGVuZ3RoOyBpKyspIHtcbiAgICAgIHRvdGFsTGVuZ3RoICs9IGxpc3RbaV0ubGVuZ3RoXG4gICAgfVxuICB9XG5cbiAgdmFyIGJ1ZiA9IG5ldyBCdWZmZXIodG90YWxMZW5ndGgpXG4gIHZhciBwb3MgPSAwXG4gIGZvciAoaSA9IDA7IGkgPCBsaXN0Lmxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIGl0ZW0gPSBsaXN0W2ldXG4gICAgaXRlbS5jb3B5KGJ1ZiwgcG9zKVxuICAgIHBvcyArPSBpdGVtLmxlbmd0aFxuICB9XG4gIHJldHVybiBidWZcbn1cblxuQnVmZmVyLmJ5dGVMZW5ndGggPSBmdW5jdGlvbiBieXRlTGVuZ3RoIChzdHIsIGVuY29kaW5nKSB7XG4gIHZhciByZXRcbiAgc3RyID0gc3RyICsgJydcbiAgc3dpdGNoIChlbmNvZGluZyB8fCAndXRmOCcpIHtcbiAgICBjYXNlICdhc2NpaSc6XG4gICAgY2FzZSAnYmluYXJ5JzpcbiAgICBjYXNlICdyYXcnOlxuICAgICAgcmV0ID0gc3RyLmxlbmd0aFxuICAgICAgYnJlYWtcbiAgICBjYXNlICd1Y3MyJzpcbiAgICBjYXNlICd1Y3MtMic6XG4gICAgY2FzZSAndXRmMTZsZSc6XG4gICAgY2FzZSAndXRmLTE2bGUnOlxuICAgICAgcmV0ID0gc3RyLmxlbmd0aCAqIDJcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAnaGV4JzpcbiAgICAgIHJldCA9IHN0ci5sZW5ndGggPj4+IDFcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAndXRmOCc6XG4gICAgY2FzZSAndXRmLTgnOlxuICAgICAgcmV0ID0gdXRmOFRvQnl0ZXMoc3RyKS5sZW5ndGhcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAnYmFzZTY0JzpcbiAgICAgIHJldCA9IGJhc2U2NFRvQnl0ZXMoc3RyKS5sZW5ndGhcbiAgICAgIGJyZWFrXG4gICAgZGVmYXVsdDpcbiAgICAgIHJldCA9IHN0ci5sZW5ndGhcbiAgfVxuICByZXR1cm4gcmV0XG59XG5cbi8vIHByZS1zZXQgZm9yIHZhbHVlcyB0aGF0IG1heSBleGlzdCBpbiB0aGUgZnV0dXJlXG5CdWZmZXIucHJvdG90eXBlLmxlbmd0aCA9IHVuZGVmaW5lZFxuQnVmZmVyLnByb3RvdHlwZS5wYXJlbnQgPSB1bmRlZmluZWRcblxuLy8gdG9TdHJpbmcoZW5jb2RpbmcsIHN0YXJ0PTAsIGVuZD1idWZmZXIubGVuZ3RoKVxuQnVmZmVyLnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uIHRvU3RyaW5nIChlbmNvZGluZywgc3RhcnQsIGVuZCkge1xuICB2YXIgbG93ZXJlZENhc2UgPSBmYWxzZVxuXG4gIHN0YXJ0ID0gc3RhcnQgPj4+IDBcbiAgZW5kID0gZW5kID09PSB1bmRlZmluZWQgfHwgZW5kID09PSBJbmZpbml0eSA/IHRoaXMubGVuZ3RoIDogZW5kID4+PiAwXG5cbiAgaWYgKCFlbmNvZGluZykgZW5jb2RpbmcgPSAndXRmOCdcbiAgaWYgKHN0YXJ0IDwgMCkgc3RhcnQgPSAwXG4gIGlmIChlbmQgPiB0aGlzLmxlbmd0aCkgZW5kID0gdGhpcy5sZW5ndGhcbiAgaWYgKGVuZCA8PSBzdGFydCkgcmV0dXJuICcnXG5cbiAgd2hpbGUgKHRydWUpIHtcbiAgICBzd2l0Y2ggKGVuY29kaW5nKSB7XG4gICAgICBjYXNlICdoZXgnOlxuICAgICAgICByZXR1cm4gaGV4U2xpY2UodGhpcywgc3RhcnQsIGVuZClcblxuICAgICAgY2FzZSAndXRmOCc6XG4gICAgICBjYXNlICd1dGYtOCc6XG4gICAgICAgIHJldHVybiB1dGY4U2xpY2UodGhpcywgc3RhcnQsIGVuZClcblxuICAgICAgY2FzZSAnYXNjaWknOlxuICAgICAgICByZXR1cm4gYXNjaWlTbGljZSh0aGlzLCBzdGFydCwgZW5kKVxuXG4gICAgICBjYXNlICdiaW5hcnknOlxuICAgICAgICByZXR1cm4gYmluYXJ5U2xpY2UodGhpcywgc3RhcnQsIGVuZClcblxuICAgICAgY2FzZSAnYmFzZTY0JzpcbiAgICAgICAgcmV0dXJuIGJhc2U2NFNsaWNlKHRoaXMsIHN0YXJ0LCBlbmQpXG5cbiAgICAgIGNhc2UgJ3VjczInOlxuICAgICAgY2FzZSAndWNzLTInOlxuICAgICAgY2FzZSAndXRmMTZsZSc6XG4gICAgICBjYXNlICd1dGYtMTZsZSc6XG4gICAgICAgIHJldHVybiB1dGYxNmxlU2xpY2UodGhpcywgc3RhcnQsIGVuZClcblxuICAgICAgZGVmYXVsdDpcbiAgICAgICAgaWYgKGxvd2VyZWRDYXNlKSB0aHJvdyBuZXcgVHlwZUVycm9yKCdVbmtub3duIGVuY29kaW5nOiAnICsgZW5jb2RpbmcpXG4gICAgICAgIGVuY29kaW5nID0gKGVuY29kaW5nICsgJycpLnRvTG93ZXJDYXNlKClcbiAgICAgICAgbG93ZXJlZENhc2UgPSB0cnVlXG4gICAgfVxuICB9XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUuZXF1YWxzID0gZnVuY3Rpb24gZXF1YWxzIChiKSB7XG4gIGlmICghQnVmZmVyLmlzQnVmZmVyKGIpKSB0aHJvdyBuZXcgVHlwZUVycm9yKCdBcmd1bWVudCBtdXN0IGJlIGEgQnVmZmVyJylcbiAgaWYgKHRoaXMgPT09IGIpIHJldHVybiB0cnVlXG4gIHJldHVybiBCdWZmZXIuY29tcGFyZSh0aGlzLCBiKSA9PT0gMFxufVxuXG5CdWZmZXIucHJvdG90eXBlLmluc3BlY3QgPSBmdW5jdGlvbiBpbnNwZWN0ICgpIHtcbiAgdmFyIHN0ciA9ICcnXG4gIHZhciBtYXggPSBleHBvcnRzLklOU1BFQ1RfTUFYX0JZVEVTXG4gIGlmICh0aGlzLmxlbmd0aCA+IDApIHtcbiAgICBzdHIgPSB0aGlzLnRvU3RyaW5nKCdoZXgnLCAwLCBtYXgpLm1hdGNoKC8uezJ9L2cpLmpvaW4oJyAnKVxuICAgIGlmICh0aGlzLmxlbmd0aCA+IG1heCkgc3RyICs9ICcgLi4uICdcbiAgfVxuICByZXR1cm4gJzxCdWZmZXIgJyArIHN0ciArICc+J1xufVxuXG5CdWZmZXIucHJvdG90eXBlLmNvbXBhcmUgPSBmdW5jdGlvbiBjb21wYXJlIChiKSB7XG4gIGlmICghQnVmZmVyLmlzQnVmZmVyKGIpKSB0aHJvdyBuZXcgVHlwZUVycm9yKCdBcmd1bWVudCBtdXN0IGJlIGEgQnVmZmVyJylcbiAgaWYgKHRoaXMgPT09IGIpIHJldHVybiAwXG4gIHJldHVybiBCdWZmZXIuY29tcGFyZSh0aGlzLCBiKVxufVxuXG5CdWZmZXIucHJvdG90eXBlLmluZGV4T2YgPSBmdW5jdGlvbiBpbmRleE9mICh2YWwsIGJ5dGVPZmZzZXQpIHtcbiAgaWYgKGJ5dGVPZmZzZXQgPiAweDdmZmZmZmZmKSBieXRlT2Zmc2V0ID0gMHg3ZmZmZmZmZlxuICBlbHNlIGlmIChieXRlT2Zmc2V0IDwgLTB4ODAwMDAwMDApIGJ5dGVPZmZzZXQgPSAtMHg4MDAwMDAwMFxuICBieXRlT2Zmc2V0ID4+PSAwXG5cbiAgaWYgKHRoaXMubGVuZ3RoID09PSAwKSByZXR1cm4gLTFcbiAgaWYgKGJ5dGVPZmZzZXQgPj0gdGhpcy5sZW5ndGgpIHJldHVybiAtMVxuXG4gIC8vIE5lZ2F0aXZlIG9mZnNldHMgc3RhcnQgZnJvbSB0aGUgZW5kIG9mIHRoZSBidWZmZXJcbiAgaWYgKGJ5dGVPZmZzZXQgPCAwKSBieXRlT2Zmc2V0ID0gTWF0aC5tYXgodGhpcy5sZW5ndGggKyBieXRlT2Zmc2V0LCAwKVxuXG4gIGlmICh0eXBlb2YgdmFsID09PSAnc3RyaW5nJykge1xuICAgIGlmICh2YWwubGVuZ3RoID09PSAwKSByZXR1cm4gLTEgLy8gc3BlY2lhbCBjYXNlOiBsb29raW5nIGZvciBlbXB0eSBzdHJpbmcgYWx3YXlzIGZhaWxzXG4gICAgcmV0dXJuIFN0cmluZy5wcm90b3R5cGUuaW5kZXhPZi5jYWxsKHRoaXMsIHZhbCwgYnl0ZU9mZnNldClcbiAgfVxuICBpZiAoQnVmZmVyLmlzQnVmZmVyKHZhbCkpIHtcbiAgICByZXR1cm4gYXJyYXlJbmRleE9mKHRoaXMsIHZhbCwgYnl0ZU9mZnNldClcbiAgfVxuICBpZiAodHlwZW9mIHZhbCA9PT0gJ251bWJlcicpIHtcbiAgICBpZiAoQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQgJiYgVWludDhBcnJheS5wcm90b3R5cGUuaW5kZXhPZiA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgcmV0dXJuIFVpbnQ4QXJyYXkucHJvdG90eXBlLmluZGV4T2YuY2FsbCh0aGlzLCB2YWwsIGJ5dGVPZmZzZXQpXG4gICAgfVxuICAgIHJldHVybiBhcnJheUluZGV4T2YodGhpcywgWyB2YWwgXSwgYnl0ZU9mZnNldClcbiAgfVxuXG4gIGZ1bmN0aW9uIGFycmF5SW5kZXhPZiAoYXJyLCB2YWwsIGJ5dGVPZmZzZXQpIHtcbiAgICB2YXIgZm91bmRJbmRleCA9IC0xXG4gICAgZm9yICh2YXIgaSA9IDA7IGJ5dGVPZmZzZXQgKyBpIDwgYXJyLmxlbmd0aDsgaSsrKSB7XG4gICAgICBpZiAoYXJyW2J5dGVPZmZzZXQgKyBpXSA9PT0gdmFsW2ZvdW5kSW5kZXggPT09IC0xID8gMCA6IGkgLSBmb3VuZEluZGV4XSkge1xuICAgICAgICBpZiAoZm91bmRJbmRleCA9PT0gLTEpIGZvdW5kSW5kZXggPSBpXG4gICAgICAgIGlmIChpIC0gZm91bmRJbmRleCArIDEgPT09IHZhbC5sZW5ndGgpIHJldHVybiBieXRlT2Zmc2V0ICsgZm91bmRJbmRleFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZm91bmRJbmRleCA9IC0xXG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiAtMVxuICB9XG5cbiAgdGhyb3cgbmV3IFR5cGVFcnJvcigndmFsIG11c3QgYmUgc3RyaW5nLCBudW1iZXIgb3IgQnVmZmVyJylcbn1cblxuLy8gYGdldGAgd2lsbCBiZSByZW1vdmVkIGluIE5vZGUgMC4xMytcbkJ1ZmZlci5wcm90b3R5cGUuZ2V0ID0gZnVuY3Rpb24gZ2V0IChvZmZzZXQpIHtcbiAgY29uc29sZS5sb2coJy5nZXQoKSBpcyBkZXByZWNhdGVkLiBBY2Nlc3MgdXNpbmcgYXJyYXkgaW5kZXhlcyBpbnN0ZWFkLicpXG4gIHJldHVybiB0aGlzLnJlYWRVSW50OChvZmZzZXQpXG59XG5cbi8vIGBzZXRgIHdpbGwgYmUgcmVtb3ZlZCBpbiBOb2RlIDAuMTMrXG5CdWZmZXIucHJvdG90eXBlLnNldCA9IGZ1bmN0aW9uIHNldCAodiwgb2Zmc2V0KSB7XG4gIGNvbnNvbGUubG9nKCcuc2V0KCkgaXMgZGVwcmVjYXRlZC4gQWNjZXNzIHVzaW5nIGFycmF5IGluZGV4ZXMgaW5zdGVhZC4nKVxuICByZXR1cm4gdGhpcy53cml0ZVVJbnQ4KHYsIG9mZnNldClcbn1cblxuZnVuY3Rpb24gaGV4V3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICBvZmZzZXQgPSBOdW1iZXIob2Zmc2V0KSB8fCAwXG4gIHZhciByZW1haW5pbmcgPSBidWYubGVuZ3RoIC0gb2Zmc2V0XG4gIGlmICghbGVuZ3RoKSB7XG4gICAgbGVuZ3RoID0gcmVtYWluaW5nXG4gIH0gZWxzZSB7XG4gICAgbGVuZ3RoID0gTnVtYmVyKGxlbmd0aClcbiAgICBpZiAobGVuZ3RoID4gcmVtYWluaW5nKSB7XG4gICAgICBsZW5ndGggPSByZW1haW5pbmdcbiAgICB9XG4gIH1cblxuICAvLyBtdXN0IGJlIGFuIGV2ZW4gbnVtYmVyIG9mIGRpZ2l0c1xuICB2YXIgc3RyTGVuID0gc3RyaW5nLmxlbmd0aFxuICBpZiAoc3RyTGVuICUgMiAhPT0gMCkgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGhleCBzdHJpbmcnKVxuXG4gIGlmIChsZW5ndGggPiBzdHJMZW4gLyAyKSB7XG4gICAgbGVuZ3RoID0gc3RyTGVuIC8gMlxuICB9XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgcGFyc2VkID0gcGFyc2VJbnQoc3RyaW5nLnN1YnN0cihpICogMiwgMiksIDE2KVxuICAgIGlmIChpc05hTihwYXJzZWQpKSB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgaGV4IHN0cmluZycpXG4gICAgYnVmW29mZnNldCArIGldID0gcGFyc2VkXG4gIH1cbiAgcmV0dXJuIGlcbn1cblxuZnVuY3Rpb24gdXRmOFdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgdmFyIGNoYXJzV3JpdHRlbiA9IGJsaXRCdWZmZXIodXRmOFRvQnl0ZXMoc3RyaW5nLCBidWYubGVuZ3RoIC0gb2Zmc2V0KSwgYnVmLCBvZmZzZXQsIGxlbmd0aClcbiAgcmV0dXJuIGNoYXJzV3JpdHRlblxufVxuXG5mdW5jdGlvbiBhc2NpaVdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgdmFyIGNoYXJzV3JpdHRlbiA9IGJsaXRCdWZmZXIoYXNjaWlUb0J5dGVzKHN0cmluZyksIGJ1Ziwgb2Zmc2V0LCBsZW5ndGgpXG4gIHJldHVybiBjaGFyc1dyaXR0ZW5cbn1cblxuZnVuY3Rpb24gYmluYXJ5V3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICByZXR1cm4gYXNjaWlXcml0ZShidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG59XG5cbmZ1bmN0aW9uIGJhc2U2NFdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgdmFyIGNoYXJzV3JpdHRlbiA9IGJsaXRCdWZmZXIoYmFzZTY0VG9CeXRlcyhzdHJpbmcpLCBidWYsIG9mZnNldCwgbGVuZ3RoKVxuICByZXR1cm4gY2hhcnNXcml0dGVuXG59XG5cbmZ1bmN0aW9uIHV0ZjE2bGVXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIHZhciBjaGFyc1dyaXR0ZW4gPSBibGl0QnVmZmVyKHV0ZjE2bGVUb0J5dGVzKHN0cmluZywgYnVmLmxlbmd0aCAtIG9mZnNldCksIGJ1Ziwgb2Zmc2V0LCBsZW5ndGgpXG4gIHJldHVybiBjaGFyc1dyaXR0ZW5cbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZSA9IGZ1bmN0aW9uIHdyaXRlIChzdHJpbmcsIG9mZnNldCwgbGVuZ3RoLCBlbmNvZGluZykge1xuICAvLyBTdXBwb3J0IGJvdGggKHN0cmluZywgb2Zmc2V0LCBsZW5ndGgsIGVuY29kaW5nKVxuICAvLyBhbmQgdGhlIGxlZ2FjeSAoc3RyaW5nLCBlbmNvZGluZywgb2Zmc2V0LCBsZW5ndGgpXG4gIGlmIChpc0Zpbml0ZShvZmZzZXQpKSB7XG4gICAgaWYgKCFpc0Zpbml0ZShsZW5ndGgpKSB7XG4gICAgICBlbmNvZGluZyA9IGxlbmd0aFxuICAgICAgbGVuZ3RoID0gdW5kZWZpbmVkXG4gICAgfVxuICB9IGVsc2UgeyAgLy8gbGVnYWN5XG4gICAgdmFyIHN3YXAgPSBlbmNvZGluZ1xuICAgIGVuY29kaW5nID0gb2Zmc2V0XG4gICAgb2Zmc2V0ID0gbGVuZ3RoXG4gICAgbGVuZ3RoID0gc3dhcFxuICB9XG5cbiAgb2Zmc2V0ID0gTnVtYmVyKG9mZnNldCkgfHwgMFxuXG4gIGlmIChsZW5ndGggPCAwIHx8IG9mZnNldCA8IDAgfHwgb2Zmc2V0ID4gdGhpcy5sZW5ndGgpIHtcbiAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcignYXR0ZW1wdCB0byB3cml0ZSBvdXRzaWRlIGJ1ZmZlciBib3VuZHMnKVxuICB9XG5cbiAgdmFyIHJlbWFpbmluZyA9IHRoaXMubGVuZ3RoIC0gb2Zmc2V0XG4gIGlmICghbGVuZ3RoKSB7XG4gICAgbGVuZ3RoID0gcmVtYWluaW5nXG4gIH0gZWxzZSB7XG4gICAgbGVuZ3RoID0gTnVtYmVyKGxlbmd0aClcbiAgICBpZiAobGVuZ3RoID4gcmVtYWluaW5nKSB7XG4gICAgICBsZW5ndGggPSByZW1haW5pbmdcbiAgICB9XG4gIH1cbiAgZW5jb2RpbmcgPSBTdHJpbmcoZW5jb2RpbmcgfHwgJ3V0ZjgnKS50b0xvd2VyQ2FzZSgpXG5cbiAgdmFyIHJldFxuICBzd2l0Y2ggKGVuY29kaW5nKSB7XG4gICAgY2FzZSAnaGV4JzpcbiAgICAgIHJldCA9IGhleFdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ3V0ZjgnOlxuICAgIGNhc2UgJ3V0Zi04JzpcbiAgICAgIHJldCA9IHV0ZjhXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICdhc2NpaSc6XG4gICAgICByZXQgPSBhc2NpaVdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ2JpbmFyeSc6XG4gICAgICByZXQgPSBiaW5hcnlXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICdiYXNlNjQnOlxuICAgICAgcmV0ID0gYmFzZTY0V3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAndWNzMic6XG4gICAgY2FzZSAndWNzLTInOlxuICAgIGNhc2UgJ3V0ZjE2bGUnOlxuICAgIGNhc2UgJ3V0Zi0xNmxlJzpcbiAgICAgIHJldCA9IHV0ZjE2bGVXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuICAgICAgYnJlYWtcbiAgICBkZWZhdWx0OlxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignVW5rbm93biBlbmNvZGluZzogJyArIGVuY29kaW5nKVxuICB9XG4gIHJldHVybiByZXRcbn1cblxuQnVmZmVyLnByb3RvdHlwZS50b0pTT04gPSBmdW5jdGlvbiB0b0pTT04gKCkge1xuICByZXR1cm4ge1xuICAgIHR5cGU6ICdCdWZmZXInLFxuICAgIGRhdGE6IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKHRoaXMuX2FyciB8fCB0aGlzLCAwKVxuICB9XG59XG5cbmZ1bmN0aW9uIGJhc2U2NFNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgaWYgKHN0YXJ0ID09PSAwICYmIGVuZCA9PT0gYnVmLmxlbmd0aCkge1xuICAgIHJldHVybiBiYXNlNjQuZnJvbUJ5dGVBcnJheShidWYpXG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIGJhc2U2NC5mcm9tQnl0ZUFycmF5KGJ1Zi5zbGljZShzdGFydCwgZW5kKSlcbiAgfVxufVxuXG5mdW5jdGlvbiB1dGY4U2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICB2YXIgcmVzID0gJydcbiAgdmFyIHRtcCA9ICcnXG4gIGVuZCA9IE1hdGgubWluKGJ1Zi5sZW5ndGgsIGVuZClcblxuICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPCBlbmQ7IGkrKykge1xuICAgIGlmIChidWZbaV0gPD0gMHg3Rikge1xuICAgICAgcmVzICs9IGRlY29kZVV0ZjhDaGFyKHRtcCkgKyBTdHJpbmcuZnJvbUNoYXJDb2RlKGJ1ZltpXSlcbiAgICAgIHRtcCA9ICcnXG4gICAgfSBlbHNlIHtcbiAgICAgIHRtcCArPSAnJScgKyBidWZbaV0udG9TdHJpbmcoMTYpXG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHJlcyArIGRlY29kZVV0ZjhDaGFyKHRtcClcbn1cblxuZnVuY3Rpb24gYXNjaWlTbGljZSAoYnVmLCBzdGFydCwgZW5kKSB7XG4gIHZhciByZXQgPSAnJ1xuICBlbmQgPSBNYXRoLm1pbihidWYubGVuZ3RoLCBlbmQpXG5cbiAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDwgZW5kOyBpKyspIHtcbiAgICByZXQgKz0gU3RyaW5nLmZyb21DaGFyQ29kZShidWZbaV0gJiAweDdGKVxuICB9XG4gIHJldHVybiByZXRcbn1cblxuZnVuY3Rpb24gYmluYXJ5U2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICB2YXIgcmV0ID0gJydcbiAgZW5kID0gTWF0aC5taW4oYnVmLmxlbmd0aCwgZW5kKVxuXG4gIGZvciAodmFyIGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKSB7XG4gICAgcmV0ICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoYnVmW2ldKVxuICB9XG4gIHJldHVybiByZXRcbn1cblxuZnVuY3Rpb24gaGV4U2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuXG4gIGlmICghc3RhcnQgfHwgc3RhcnQgPCAwKSBzdGFydCA9IDBcbiAgaWYgKCFlbmQgfHwgZW5kIDwgMCB8fCBlbmQgPiBsZW4pIGVuZCA9IGxlblxuXG4gIHZhciBvdXQgPSAnJ1xuICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPCBlbmQ7IGkrKykge1xuICAgIG91dCArPSB0b0hleChidWZbaV0pXG4gIH1cbiAgcmV0dXJuIG91dFxufVxuXG5mdW5jdGlvbiB1dGYxNmxlU2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICB2YXIgYnl0ZXMgPSBidWYuc2xpY2Uoc3RhcnQsIGVuZClcbiAgdmFyIHJlcyA9ICcnXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgYnl0ZXMubGVuZ3RoOyBpICs9IDIpIHtcbiAgICByZXMgKz0gU3RyaW5nLmZyb21DaGFyQ29kZShieXRlc1tpXSArIGJ5dGVzW2kgKyAxXSAqIDI1NilcbiAgfVxuICByZXR1cm4gcmVzXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUuc2xpY2UgPSBmdW5jdGlvbiBzbGljZSAoc3RhcnQsIGVuZCkge1xuICB2YXIgbGVuID0gdGhpcy5sZW5ndGhcbiAgc3RhcnQgPSB+fnN0YXJ0XG4gIGVuZCA9IGVuZCA9PT0gdW5kZWZpbmVkID8gbGVuIDogfn5lbmRcblxuICBpZiAoc3RhcnQgPCAwKSB7XG4gICAgc3RhcnQgKz0gbGVuXG4gICAgaWYgKHN0YXJ0IDwgMCkgc3RhcnQgPSAwXG4gIH0gZWxzZSBpZiAoc3RhcnQgPiBsZW4pIHtcbiAgICBzdGFydCA9IGxlblxuICB9XG5cbiAgaWYgKGVuZCA8IDApIHtcbiAgICBlbmQgKz0gbGVuXG4gICAgaWYgKGVuZCA8IDApIGVuZCA9IDBcbiAgfSBlbHNlIGlmIChlbmQgPiBsZW4pIHtcbiAgICBlbmQgPSBsZW5cbiAgfVxuXG4gIGlmIChlbmQgPCBzdGFydCkgZW5kID0gc3RhcnRcblxuICB2YXIgbmV3QnVmXG4gIGlmIChCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkge1xuICAgIG5ld0J1ZiA9IEJ1ZmZlci5fYXVnbWVudCh0aGlzLnN1YmFycmF5KHN0YXJ0LCBlbmQpKVxuICB9IGVsc2Uge1xuICAgIHZhciBzbGljZUxlbiA9IGVuZCAtIHN0YXJ0XG4gICAgbmV3QnVmID0gbmV3IEJ1ZmZlcihzbGljZUxlbiwgdW5kZWZpbmVkKVxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgc2xpY2VMZW47IGkrKykge1xuICAgICAgbmV3QnVmW2ldID0gdGhpc1tpICsgc3RhcnRdXG4gICAgfVxuICB9XG5cbiAgaWYgKG5ld0J1Zi5sZW5ndGgpIG5ld0J1Zi5wYXJlbnQgPSB0aGlzLnBhcmVudCB8fCB0aGlzXG5cbiAgcmV0dXJuIG5ld0J1ZlxufVxuXG4vKlxuICogTmVlZCB0byBtYWtlIHN1cmUgdGhhdCBidWZmZXIgaXNuJ3QgdHJ5aW5nIHRvIHdyaXRlIG91dCBvZiBib3VuZHMuXG4gKi9cbmZ1bmN0aW9uIGNoZWNrT2Zmc2V0IChvZmZzZXQsIGV4dCwgbGVuZ3RoKSB7XG4gIGlmICgob2Zmc2V0ICUgMSkgIT09IDAgfHwgb2Zmc2V0IDwgMCkgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ29mZnNldCBpcyBub3QgdWludCcpXG4gIGlmIChvZmZzZXQgKyBleHQgPiBsZW5ndGgpIHRocm93IG5ldyBSYW5nZUVycm9yKCdUcnlpbmcgdG8gYWNjZXNzIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludExFID0gZnVuY3Rpb24gcmVhZFVJbnRMRSAob2Zmc2V0LCBieXRlTGVuZ3RoLCBub0Fzc2VydCkge1xuICBvZmZzZXQgPSBvZmZzZXQgPj4+IDBcbiAgYnl0ZUxlbmd0aCA9IGJ5dGVMZW5ndGggPj4+IDBcbiAgaWYgKCFub0Fzc2VydCkgY2hlY2tPZmZzZXQob2Zmc2V0LCBieXRlTGVuZ3RoLCB0aGlzLmxlbmd0aClcblxuICB2YXIgdmFsID0gdGhpc1tvZmZzZXRdXG4gIHZhciBtdWwgPSAxXG4gIHZhciBpID0gMFxuICB3aGlsZSAoKytpIDwgYnl0ZUxlbmd0aCAmJiAobXVsICo9IDB4MTAwKSkge1xuICAgIHZhbCArPSB0aGlzW29mZnNldCArIGldICogbXVsXG4gIH1cblxuICByZXR1cm4gdmFsXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZFVJbnRCRSA9IGZ1bmN0aW9uIHJlYWRVSW50QkUgKG9mZnNldCwgYnl0ZUxlbmd0aCwgbm9Bc3NlcnQpIHtcbiAgb2Zmc2V0ID0gb2Zmc2V0ID4+PiAwXG4gIGJ5dGVMZW5ndGggPSBieXRlTGVuZ3RoID4+PiAwXG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBjaGVja09mZnNldChvZmZzZXQsIGJ5dGVMZW5ndGgsIHRoaXMubGVuZ3RoKVxuICB9XG5cbiAgdmFyIHZhbCA9IHRoaXNbb2Zmc2V0ICsgLS1ieXRlTGVuZ3RoXVxuICB2YXIgbXVsID0gMVxuICB3aGlsZSAoYnl0ZUxlbmd0aCA+IDAgJiYgKG11bCAqPSAweDEwMCkpIHtcbiAgICB2YWwgKz0gdGhpc1tvZmZzZXQgKyAtLWJ5dGVMZW5ndGhdICogbXVsXG4gIH1cblxuICByZXR1cm4gdmFsXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZFVJbnQ4ID0gZnVuY3Rpb24gcmVhZFVJbnQ4IChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIGNoZWNrT2Zmc2V0KG9mZnNldCwgMSwgdGhpcy5sZW5ndGgpXG4gIHJldHVybiB0aGlzW29mZnNldF1cbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludDE2TEUgPSBmdW5jdGlvbiByZWFkVUludDE2TEUgKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkgY2hlY2tPZmZzZXQob2Zmc2V0LCAyLCB0aGlzLmxlbmd0aClcbiAgcmV0dXJuIHRoaXNbb2Zmc2V0XSB8ICh0aGlzW29mZnNldCArIDFdIDw8IDgpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZFVJbnQxNkJFID0gZnVuY3Rpb24gcmVhZFVJbnQxNkJFIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIGNoZWNrT2Zmc2V0KG9mZnNldCwgMiwgdGhpcy5sZW5ndGgpXG4gIHJldHVybiAodGhpc1tvZmZzZXRdIDw8IDgpIHwgdGhpc1tvZmZzZXQgKyAxXVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRVSW50MzJMRSA9IGZ1bmN0aW9uIHJlYWRVSW50MzJMRSAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSBjaGVja09mZnNldChvZmZzZXQsIDQsIHRoaXMubGVuZ3RoKVxuXG4gIHJldHVybiAoKHRoaXNbb2Zmc2V0XSkgfFxuICAgICAgKHRoaXNbb2Zmc2V0ICsgMV0gPDwgOCkgfFxuICAgICAgKHRoaXNbb2Zmc2V0ICsgMl0gPDwgMTYpKSArXG4gICAgICAodGhpc1tvZmZzZXQgKyAzXSAqIDB4MTAwMDAwMClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludDMyQkUgPSBmdW5jdGlvbiByZWFkVUludDMyQkUgKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkgY2hlY2tPZmZzZXQob2Zmc2V0LCA0LCB0aGlzLmxlbmd0aClcblxuICByZXR1cm4gKHRoaXNbb2Zmc2V0XSAqIDB4MTAwMDAwMCkgK1xuICAgICgodGhpc1tvZmZzZXQgKyAxXSA8PCAxNikgfFxuICAgICh0aGlzW29mZnNldCArIDJdIDw8IDgpIHxcbiAgICB0aGlzW29mZnNldCArIDNdKVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRJbnRMRSA9IGZ1bmN0aW9uIHJlYWRJbnRMRSAob2Zmc2V0LCBieXRlTGVuZ3RoLCBub0Fzc2VydCkge1xuICBvZmZzZXQgPSBvZmZzZXQgPj4+IDBcbiAgYnl0ZUxlbmd0aCA9IGJ5dGVMZW5ndGggPj4+IDBcbiAgaWYgKCFub0Fzc2VydCkgY2hlY2tPZmZzZXQob2Zmc2V0LCBieXRlTGVuZ3RoLCB0aGlzLmxlbmd0aClcblxuICB2YXIgdmFsID0gdGhpc1tvZmZzZXRdXG4gIHZhciBtdWwgPSAxXG4gIHZhciBpID0gMFxuICB3aGlsZSAoKytpIDwgYnl0ZUxlbmd0aCAmJiAobXVsICo9IDB4MTAwKSkge1xuICAgIHZhbCArPSB0aGlzW29mZnNldCArIGldICogbXVsXG4gIH1cbiAgbXVsICo9IDB4ODBcblxuICBpZiAodmFsID49IG11bCkgdmFsIC09IE1hdGgucG93KDIsIDggKiBieXRlTGVuZ3RoKVxuXG4gIHJldHVybiB2YWxcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50QkUgPSBmdW5jdGlvbiByZWFkSW50QkUgKG9mZnNldCwgYnl0ZUxlbmd0aCwgbm9Bc3NlcnQpIHtcbiAgb2Zmc2V0ID0gb2Zmc2V0ID4+PiAwXG4gIGJ5dGVMZW5ndGggPSBieXRlTGVuZ3RoID4+PiAwXG4gIGlmICghbm9Bc3NlcnQpIGNoZWNrT2Zmc2V0KG9mZnNldCwgYnl0ZUxlbmd0aCwgdGhpcy5sZW5ndGgpXG5cbiAgdmFyIGkgPSBieXRlTGVuZ3RoXG4gIHZhciBtdWwgPSAxXG4gIHZhciB2YWwgPSB0aGlzW29mZnNldCArIC0taV1cbiAgd2hpbGUgKGkgPiAwICYmIChtdWwgKj0gMHgxMDApKSB7XG4gICAgdmFsICs9IHRoaXNbb2Zmc2V0ICsgLS1pXSAqIG11bFxuICB9XG4gIG11bCAqPSAweDgwXG5cbiAgaWYgKHZhbCA+PSBtdWwpIHZhbCAtPSBNYXRoLnBvdygyLCA4ICogYnl0ZUxlbmd0aClcblxuICByZXR1cm4gdmFsXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludDggPSBmdW5jdGlvbiByZWFkSW50OCAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSBjaGVja09mZnNldChvZmZzZXQsIDEsIHRoaXMubGVuZ3RoKVxuICBpZiAoISh0aGlzW29mZnNldF0gJiAweDgwKSkgcmV0dXJuICh0aGlzW29mZnNldF0pXG4gIHJldHVybiAoKDB4ZmYgLSB0aGlzW29mZnNldF0gKyAxKSAqIC0xKVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRJbnQxNkxFID0gZnVuY3Rpb24gcmVhZEludDE2TEUgKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkgY2hlY2tPZmZzZXQob2Zmc2V0LCAyLCB0aGlzLmxlbmd0aClcbiAgdmFyIHZhbCA9IHRoaXNbb2Zmc2V0XSB8ICh0aGlzW29mZnNldCArIDFdIDw8IDgpXG4gIHJldHVybiAodmFsICYgMHg4MDAwKSA/IHZhbCB8IDB4RkZGRjAwMDAgOiB2YWxcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50MTZCRSA9IGZ1bmN0aW9uIHJlYWRJbnQxNkJFIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIGNoZWNrT2Zmc2V0KG9mZnNldCwgMiwgdGhpcy5sZW5ndGgpXG4gIHZhciB2YWwgPSB0aGlzW29mZnNldCArIDFdIHwgKHRoaXNbb2Zmc2V0XSA8PCA4KVxuICByZXR1cm4gKHZhbCAmIDB4ODAwMCkgPyB2YWwgfCAweEZGRkYwMDAwIDogdmFsXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludDMyTEUgPSBmdW5jdGlvbiByZWFkSW50MzJMRSAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSBjaGVja09mZnNldChvZmZzZXQsIDQsIHRoaXMubGVuZ3RoKVxuXG4gIHJldHVybiAodGhpc1tvZmZzZXRdKSB8XG4gICAgKHRoaXNbb2Zmc2V0ICsgMV0gPDwgOCkgfFxuICAgICh0aGlzW29mZnNldCArIDJdIDw8IDE2KSB8XG4gICAgKHRoaXNbb2Zmc2V0ICsgM10gPDwgMjQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludDMyQkUgPSBmdW5jdGlvbiByZWFkSW50MzJCRSAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSBjaGVja09mZnNldChvZmZzZXQsIDQsIHRoaXMubGVuZ3RoKVxuXG4gIHJldHVybiAodGhpc1tvZmZzZXRdIDw8IDI0KSB8XG4gICAgKHRoaXNbb2Zmc2V0ICsgMV0gPDwgMTYpIHxcbiAgICAodGhpc1tvZmZzZXQgKyAyXSA8PCA4KSB8XG4gICAgKHRoaXNbb2Zmc2V0ICsgM10pXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEZsb2F0TEUgPSBmdW5jdGlvbiByZWFkRmxvYXRMRSAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSBjaGVja09mZnNldChvZmZzZXQsIDQsIHRoaXMubGVuZ3RoKVxuICByZXR1cm4gaWVlZTc1NC5yZWFkKHRoaXMsIG9mZnNldCwgdHJ1ZSwgMjMsIDQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEZsb2F0QkUgPSBmdW5jdGlvbiByZWFkRmxvYXRCRSAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSBjaGVja09mZnNldChvZmZzZXQsIDQsIHRoaXMubGVuZ3RoKVxuICByZXR1cm4gaWVlZTc1NC5yZWFkKHRoaXMsIG9mZnNldCwgZmFsc2UsIDIzLCA0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWREb3VibGVMRSA9IGZ1bmN0aW9uIHJlYWREb3VibGVMRSAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSBjaGVja09mZnNldChvZmZzZXQsIDgsIHRoaXMubGVuZ3RoKVxuICByZXR1cm4gaWVlZTc1NC5yZWFkKHRoaXMsIG9mZnNldCwgdHJ1ZSwgNTIsIDgpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZERvdWJsZUJFID0gZnVuY3Rpb24gcmVhZERvdWJsZUJFIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIGNoZWNrT2Zmc2V0KG9mZnNldCwgOCwgdGhpcy5sZW5ndGgpXG4gIHJldHVybiBpZWVlNzU0LnJlYWQodGhpcywgb2Zmc2V0LCBmYWxzZSwgNTIsIDgpXG59XG5cbmZ1bmN0aW9uIGNoZWNrSW50IChidWYsIHZhbHVlLCBvZmZzZXQsIGV4dCwgbWF4LCBtaW4pIHtcbiAgaWYgKCFCdWZmZXIuaXNCdWZmZXIoYnVmKSkgdGhyb3cgbmV3IFR5cGVFcnJvcignYnVmZmVyIG11c3QgYmUgYSBCdWZmZXIgaW5zdGFuY2UnKVxuICBpZiAodmFsdWUgPiBtYXggfHwgdmFsdWUgPCBtaW4pIHRocm93IG5ldyBSYW5nZUVycm9yKCd2YWx1ZSBpcyBvdXQgb2YgYm91bmRzJylcbiAgaWYgKG9mZnNldCArIGV4dCA+IGJ1Zi5sZW5ndGgpIHRocm93IG5ldyBSYW5nZUVycm9yKCdpbmRleCBvdXQgb2YgcmFuZ2UnKVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlVUludExFID0gZnVuY3Rpb24gd3JpdGVVSW50TEUgKHZhbHVlLCBvZmZzZXQsIGJ5dGVMZW5ndGgsIG5vQXNzZXJ0KSB7XG4gIHZhbHVlID0gK3ZhbHVlXG4gIG9mZnNldCA9IG9mZnNldCA+Pj4gMFxuICBieXRlTGVuZ3RoID0gYnl0ZUxlbmd0aCA+Pj4gMFxuICBpZiAoIW5vQXNzZXJ0KSBjaGVja0ludCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBieXRlTGVuZ3RoLCBNYXRoLnBvdygyLCA4ICogYnl0ZUxlbmd0aCksIDApXG5cbiAgdmFyIG11bCA9IDFcbiAgdmFyIGkgPSAwXG4gIHRoaXNbb2Zmc2V0XSA9IHZhbHVlICYgMHhGRlxuICB3aGlsZSAoKytpIDwgYnl0ZUxlbmd0aCAmJiAobXVsICo9IDB4MTAwKSkge1xuICAgIHRoaXNbb2Zmc2V0ICsgaV0gPSAodmFsdWUgLyBtdWwpID4+PiAwICYgMHhGRlxuICB9XG5cbiAgcmV0dXJuIG9mZnNldCArIGJ5dGVMZW5ndGhcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnRCRSA9IGZ1bmN0aW9uIHdyaXRlVUludEJFICh2YWx1ZSwgb2Zmc2V0LCBieXRlTGVuZ3RoLCBub0Fzc2VydCkge1xuICB2YWx1ZSA9ICt2YWx1ZVxuICBvZmZzZXQgPSBvZmZzZXQgPj4+IDBcbiAgYnl0ZUxlbmd0aCA9IGJ5dGVMZW5ndGggPj4+IDBcbiAgaWYgKCFub0Fzc2VydCkgY2hlY2tJbnQodGhpcywgdmFsdWUsIG9mZnNldCwgYnl0ZUxlbmd0aCwgTWF0aC5wb3coMiwgOCAqIGJ5dGVMZW5ndGgpLCAwKVxuXG4gIHZhciBpID0gYnl0ZUxlbmd0aCAtIDFcbiAgdmFyIG11bCA9IDFcbiAgdGhpc1tvZmZzZXQgKyBpXSA9IHZhbHVlICYgMHhGRlxuICB3aGlsZSAoLS1pID49IDAgJiYgKG11bCAqPSAweDEwMCkpIHtcbiAgICB0aGlzW29mZnNldCArIGldID0gKHZhbHVlIC8gbXVsKSA+Pj4gMCAmIDB4RkZcbiAgfVxuXG4gIHJldHVybiBvZmZzZXQgKyBieXRlTGVuZ3RoXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVVSW50OCA9IGZ1bmN0aW9uIHdyaXRlVUludDggKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHZhbHVlID0gK3ZhbHVlXG4gIG9mZnNldCA9IG9mZnNldCA+Pj4gMFxuICBpZiAoIW5vQXNzZXJ0KSBjaGVja0ludCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCAxLCAweGZmLCAwKVxuICBpZiAoIUJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUKSB2YWx1ZSA9IE1hdGguZmxvb3IodmFsdWUpXG4gIHRoaXNbb2Zmc2V0XSA9IHZhbHVlXG4gIHJldHVybiBvZmZzZXQgKyAxXG59XG5cbmZ1bmN0aW9uIG9iamVjdFdyaXRlVUludDE2IChidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbikge1xuICBpZiAodmFsdWUgPCAwKSB2YWx1ZSA9IDB4ZmZmZiArIHZhbHVlICsgMVxuICBmb3IgKHZhciBpID0gMCwgaiA9IE1hdGgubWluKGJ1Zi5sZW5ndGggLSBvZmZzZXQsIDIpOyBpIDwgajsgaSsrKSB7XG4gICAgYnVmW29mZnNldCArIGldID0gKHZhbHVlICYgKDB4ZmYgPDwgKDggKiAobGl0dGxlRW5kaWFuID8gaSA6IDEgLSBpKSkpKSA+Pj5cbiAgICAgIChsaXR0bGVFbmRpYW4gPyBpIDogMSAtIGkpICogOFxuICB9XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVVSW50MTZMRSA9IGZ1bmN0aW9uIHdyaXRlVUludDE2TEUgKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHZhbHVlID0gK3ZhbHVlXG4gIG9mZnNldCA9IG9mZnNldCA+Pj4gMFxuICBpZiAoIW5vQXNzZXJ0KSBjaGVja0ludCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCAyLCAweGZmZmYsIDApXG4gIGlmIChCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkge1xuICAgIHRoaXNbb2Zmc2V0XSA9IHZhbHVlXG4gICAgdGhpc1tvZmZzZXQgKyAxXSA9ICh2YWx1ZSA+Pj4gOClcbiAgfSBlbHNlIHtcbiAgICBvYmplY3RXcml0ZVVJbnQxNih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlKVxuICB9XG4gIHJldHVybiBvZmZzZXQgKyAyXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVVSW50MTZCRSA9IGZ1bmN0aW9uIHdyaXRlVUludDE2QkUgKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHZhbHVlID0gK3ZhbHVlXG4gIG9mZnNldCA9IG9mZnNldCA+Pj4gMFxuICBpZiAoIW5vQXNzZXJ0KSBjaGVja0ludCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCAyLCAweGZmZmYsIDApXG4gIGlmIChCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkge1xuICAgIHRoaXNbb2Zmc2V0XSA9ICh2YWx1ZSA+Pj4gOClcbiAgICB0aGlzW29mZnNldCArIDFdID0gdmFsdWVcbiAgfSBlbHNlIHtcbiAgICBvYmplY3RXcml0ZVVJbnQxNih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSlcbiAgfVxuICByZXR1cm4gb2Zmc2V0ICsgMlxufVxuXG5mdW5jdGlvbiBvYmplY3RXcml0ZVVJbnQzMiAoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4pIHtcbiAgaWYgKHZhbHVlIDwgMCkgdmFsdWUgPSAweGZmZmZmZmZmICsgdmFsdWUgKyAxXG4gIGZvciAodmFyIGkgPSAwLCBqID0gTWF0aC5taW4oYnVmLmxlbmd0aCAtIG9mZnNldCwgNCk7IGkgPCBqOyBpKyspIHtcbiAgICBidWZbb2Zmc2V0ICsgaV0gPSAodmFsdWUgPj4+IChsaXR0bGVFbmRpYW4gPyBpIDogMyAtIGkpICogOCkgJiAweGZmXG4gIH1cbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQzMkxFID0gZnVuY3Rpb24gd3JpdGVVSW50MzJMRSAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgdmFsdWUgPSArdmFsdWVcbiAgb2Zmc2V0ID0gb2Zmc2V0ID4+PiAwXG4gIGlmICghbm9Bc3NlcnQpIGNoZWNrSW50KHRoaXMsIHZhbHVlLCBvZmZzZXQsIDQsIDB4ZmZmZmZmZmYsIDApXG4gIGlmIChCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkge1xuICAgIHRoaXNbb2Zmc2V0ICsgM10gPSAodmFsdWUgPj4+IDI0KVxuICAgIHRoaXNbb2Zmc2V0ICsgMl0gPSAodmFsdWUgPj4+IDE2KVxuICAgIHRoaXNbb2Zmc2V0ICsgMV0gPSAodmFsdWUgPj4+IDgpXG4gICAgdGhpc1tvZmZzZXRdID0gdmFsdWVcbiAgfSBlbHNlIHtcbiAgICBvYmplY3RXcml0ZVVJbnQzMih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlKVxuICB9XG4gIHJldHVybiBvZmZzZXQgKyA0XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVVSW50MzJCRSA9IGZ1bmN0aW9uIHdyaXRlVUludDMyQkUgKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHZhbHVlID0gK3ZhbHVlXG4gIG9mZnNldCA9IG9mZnNldCA+Pj4gMFxuICBpZiAoIW5vQXNzZXJ0KSBjaGVja0ludCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCA0LCAweGZmZmZmZmZmLCAwKVxuICBpZiAoQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQpIHtcbiAgICB0aGlzW29mZnNldF0gPSAodmFsdWUgPj4+IDI0KVxuICAgIHRoaXNbb2Zmc2V0ICsgMV0gPSAodmFsdWUgPj4+IDE2KVxuICAgIHRoaXNbb2Zmc2V0ICsgMl0gPSAodmFsdWUgPj4+IDgpXG4gICAgdGhpc1tvZmZzZXQgKyAzXSA9IHZhbHVlXG4gIH0gZWxzZSB7XG4gICAgb2JqZWN0V3JpdGVVSW50MzIodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UpXG4gIH1cbiAgcmV0dXJuIG9mZnNldCArIDRcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludExFID0gZnVuY3Rpb24gd3JpdGVJbnRMRSAodmFsdWUsIG9mZnNldCwgYnl0ZUxlbmd0aCwgbm9Bc3NlcnQpIHtcbiAgdmFsdWUgPSArdmFsdWVcbiAgb2Zmc2V0ID0gb2Zmc2V0ID4+PiAwXG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBjaGVja0ludChcbiAgICAgIHRoaXMsIHZhbHVlLCBvZmZzZXQsIGJ5dGVMZW5ndGgsXG4gICAgICBNYXRoLnBvdygyLCA4ICogYnl0ZUxlbmd0aCAtIDEpIC0gMSxcbiAgICAgIC1NYXRoLnBvdygyLCA4ICogYnl0ZUxlbmd0aCAtIDEpXG4gICAgKVxuICB9XG5cbiAgdmFyIGkgPSAwXG4gIHZhciBtdWwgPSAxXG4gIHZhciBzdWIgPSB2YWx1ZSA8IDAgPyAxIDogMFxuICB0aGlzW29mZnNldF0gPSB2YWx1ZSAmIDB4RkZcbiAgd2hpbGUgKCsraSA8IGJ5dGVMZW5ndGggJiYgKG11bCAqPSAweDEwMCkpIHtcbiAgICB0aGlzW29mZnNldCArIGldID0gKCh2YWx1ZSAvIG11bCkgPj4gMCkgLSBzdWIgJiAweEZGXG4gIH1cblxuICByZXR1cm4gb2Zmc2V0ICsgYnl0ZUxlbmd0aFxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50QkUgPSBmdW5jdGlvbiB3cml0ZUludEJFICh2YWx1ZSwgb2Zmc2V0LCBieXRlTGVuZ3RoLCBub0Fzc2VydCkge1xuICB2YWx1ZSA9ICt2YWx1ZVxuICBvZmZzZXQgPSBvZmZzZXQgPj4+IDBcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGNoZWNrSW50KFxuICAgICAgdGhpcywgdmFsdWUsIG9mZnNldCwgYnl0ZUxlbmd0aCxcbiAgICAgIE1hdGgucG93KDIsIDggKiBieXRlTGVuZ3RoIC0gMSkgLSAxLFxuICAgICAgLU1hdGgucG93KDIsIDggKiBieXRlTGVuZ3RoIC0gMSlcbiAgICApXG4gIH1cblxuICB2YXIgaSA9IGJ5dGVMZW5ndGggLSAxXG4gIHZhciBtdWwgPSAxXG4gIHZhciBzdWIgPSB2YWx1ZSA8IDAgPyAxIDogMFxuICB0aGlzW29mZnNldCArIGldID0gdmFsdWUgJiAweEZGXG4gIHdoaWxlICgtLWkgPj0gMCAmJiAobXVsICo9IDB4MTAwKSkge1xuICAgIHRoaXNbb2Zmc2V0ICsgaV0gPSAoKHZhbHVlIC8gbXVsKSA+PiAwKSAtIHN1YiAmIDB4RkZcbiAgfVxuXG4gIHJldHVybiBvZmZzZXQgKyBieXRlTGVuZ3RoXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVJbnQ4ID0gZnVuY3Rpb24gd3JpdGVJbnQ4ICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICB2YWx1ZSA9ICt2YWx1ZVxuICBvZmZzZXQgPSBvZmZzZXQgPj4+IDBcbiAgaWYgKCFub0Fzc2VydCkgY2hlY2tJbnQodGhpcywgdmFsdWUsIG9mZnNldCwgMSwgMHg3ZiwgLTB4ODApXG4gIGlmICghQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQpIHZhbHVlID0gTWF0aC5mbG9vcih2YWx1ZSlcbiAgaWYgKHZhbHVlIDwgMCkgdmFsdWUgPSAweGZmICsgdmFsdWUgKyAxXG4gIHRoaXNbb2Zmc2V0XSA9IHZhbHVlXG4gIHJldHVybiBvZmZzZXQgKyAxXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVJbnQxNkxFID0gZnVuY3Rpb24gd3JpdGVJbnQxNkxFICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICB2YWx1ZSA9ICt2YWx1ZVxuICBvZmZzZXQgPSBvZmZzZXQgPj4+IDBcbiAgaWYgKCFub0Fzc2VydCkgY2hlY2tJbnQodGhpcywgdmFsdWUsIG9mZnNldCwgMiwgMHg3ZmZmLCAtMHg4MDAwKVxuICBpZiAoQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQpIHtcbiAgICB0aGlzW29mZnNldF0gPSB2YWx1ZVxuICAgIHRoaXNbb2Zmc2V0ICsgMV0gPSAodmFsdWUgPj4+IDgpXG4gIH0gZWxzZSB7XG4gICAgb2JqZWN0V3JpdGVVSW50MTYodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSlcbiAgfVxuICByZXR1cm4gb2Zmc2V0ICsgMlxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50MTZCRSA9IGZ1bmN0aW9uIHdyaXRlSW50MTZCRSAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgdmFsdWUgPSArdmFsdWVcbiAgb2Zmc2V0ID0gb2Zmc2V0ID4+PiAwXG4gIGlmICghbm9Bc3NlcnQpIGNoZWNrSW50KHRoaXMsIHZhbHVlLCBvZmZzZXQsIDIsIDB4N2ZmZiwgLTB4ODAwMClcbiAgaWYgKEJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUKSB7XG4gICAgdGhpc1tvZmZzZXRdID0gKHZhbHVlID4+PiA4KVxuICAgIHRoaXNbb2Zmc2V0ICsgMV0gPSB2YWx1ZVxuICB9IGVsc2Uge1xuICAgIG9iamVjdFdyaXRlVUludDE2KHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlKVxuICB9XG4gIHJldHVybiBvZmZzZXQgKyAyXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVJbnQzMkxFID0gZnVuY3Rpb24gd3JpdGVJbnQzMkxFICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICB2YWx1ZSA9ICt2YWx1ZVxuICBvZmZzZXQgPSBvZmZzZXQgPj4+IDBcbiAgaWYgKCFub0Fzc2VydCkgY2hlY2tJbnQodGhpcywgdmFsdWUsIG9mZnNldCwgNCwgMHg3ZmZmZmZmZiwgLTB4ODAwMDAwMDApXG4gIGlmIChCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkge1xuICAgIHRoaXNbb2Zmc2V0XSA9IHZhbHVlXG4gICAgdGhpc1tvZmZzZXQgKyAxXSA9ICh2YWx1ZSA+Pj4gOClcbiAgICB0aGlzW29mZnNldCArIDJdID0gKHZhbHVlID4+PiAxNilcbiAgICB0aGlzW29mZnNldCArIDNdID0gKHZhbHVlID4+PiAyNClcbiAgfSBlbHNlIHtcbiAgICBvYmplY3RXcml0ZVVJbnQzMih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlKVxuICB9XG4gIHJldHVybiBvZmZzZXQgKyA0XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVJbnQzMkJFID0gZnVuY3Rpb24gd3JpdGVJbnQzMkJFICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICB2YWx1ZSA9ICt2YWx1ZVxuICBvZmZzZXQgPSBvZmZzZXQgPj4+IDBcbiAgaWYgKCFub0Fzc2VydCkgY2hlY2tJbnQodGhpcywgdmFsdWUsIG9mZnNldCwgNCwgMHg3ZmZmZmZmZiwgLTB4ODAwMDAwMDApXG4gIGlmICh2YWx1ZSA8IDApIHZhbHVlID0gMHhmZmZmZmZmZiArIHZhbHVlICsgMVxuICBpZiAoQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQpIHtcbiAgICB0aGlzW29mZnNldF0gPSAodmFsdWUgPj4+IDI0KVxuICAgIHRoaXNbb2Zmc2V0ICsgMV0gPSAodmFsdWUgPj4+IDE2KVxuICAgIHRoaXNbb2Zmc2V0ICsgMl0gPSAodmFsdWUgPj4+IDgpXG4gICAgdGhpc1tvZmZzZXQgKyAzXSA9IHZhbHVlXG4gIH0gZWxzZSB7XG4gICAgb2JqZWN0V3JpdGVVSW50MzIodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UpXG4gIH1cbiAgcmV0dXJuIG9mZnNldCArIDRcbn1cblxuZnVuY3Rpb24gY2hlY2tJRUVFNzU0IChidWYsIHZhbHVlLCBvZmZzZXQsIGV4dCwgbWF4LCBtaW4pIHtcbiAgaWYgKHZhbHVlID4gbWF4IHx8IHZhbHVlIDwgbWluKSB0aHJvdyBuZXcgUmFuZ2VFcnJvcigndmFsdWUgaXMgb3V0IG9mIGJvdW5kcycpXG4gIGlmIChvZmZzZXQgKyBleHQgPiBidWYubGVuZ3RoKSB0aHJvdyBuZXcgUmFuZ2VFcnJvcignaW5kZXggb3V0IG9mIHJhbmdlJylcbiAgaWYgKG9mZnNldCA8IDApIHRocm93IG5ldyBSYW5nZUVycm9yKCdpbmRleCBvdXQgb2YgcmFuZ2UnKVxufVxuXG5mdW5jdGlvbiB3cml0ZUZsb2F0IChidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGNoZWNrSUVFRTc1NChidWYsIHZhbHVlLCBvZmZzZXQsIDQsIDMuNDAyODIzNDY2Mzg1Mjg4NmUrMzgsIC0zLjQwMjgyMzQ2NjM4NTI4ODZlKzM4KVxuICB9XG4gIGllZWU3NTQud3JpdGUoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIDIzLCA0KVxuICByZXR1cm4gb2Zmc2V0ICsgNFxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlRmxvYXRMRSA9IGZ1bmN0aW9uIHdyaXRlRmxvYXRMRSAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIHdyaXRlRmxvYXQodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVGbG9hdEJFID0gZnVuY3Rpb24gd3JpdGVGbG9hdEJFICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gd3JpdGVGbG9hdCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIHdyaXRlRG91YmxlIChidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGNoZWNrSUVFRTc1NChidWYsIHZhbHVlLCBvZmZzZXQsIDgsIDEuNzk3NjkzMTM0ODYyMzE1N0UrMzA4LCAtMS43OTc2OTMxMzQ4NjIzMTU3RSszMDgpXG4gIH1cbiAgaWVlZTc1NC53cml0ZShidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgNTIsIDgpXG4gIHJldHVybiBvZmZzZXQgKyA4XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVEb3VibGVMRSA9IGZ1bmN0aW9uIHdyaXRlRG91YmxlTEUgKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiB3cml0ZURvdWJsZSh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZURvdWJsZUJFID0gZnVuY3Rpb24gd3JpdGVEb3VibGVCRSAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIHdyaXRlRG91YmxlKHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuLy8gY29weSh0YXJnZXRCdWZmZXIsIHRhcmdldFN0YXJ0PTAsIHNvdXJjZVN0YXJ0PTAsIHNvdXJjZUVuZD1idWZmZXIubGVuZ3RoKVxuQnVmZmVyLnByb3RvdHlwZS5jb3B5ID0gZnVuY3Rpb24gY29weSAodGFyZ2V0LCB0YXJnZXRfc3RhcnQsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIHNlbGYgPSB0aGlzIC8vIHNvdXJjZVxuXG4gIGlmICghc3RhcnQpIHN0YXJ0ID0gMFxuICBpZiAoIWVuZCAmJiBlbmQgIT09IDApIGVuZCA9IHRoaXMubGVuZ3RoXG4gIGlmICh0YXJnZXRfc3RhcnQgPj0gdGFyZ2V0Lmxlbmd0aCkgdGFyZ2V0X3N0YXJ0ID0gdGFyZ2V0Lmxlbmd0aFxuICBpZiAoIXRhcmdldF9zdGFydCkgdGFyZ2V0X3N0YXJ0ID0gMFxuICBpZiAoZW5kID4gMCAmJiBlbmQgPCBzdGFydCkgZW5kID0gc3RhcnRcblxuICAvLyBDb3B5IDAgYnl0ZXM7IHdlJ3JlIGRvbmVcbiAgaWYgKGVuZCA9PT0gc3RhcnQpIHJldHVybiAwXG4gIGlmICh0YXJnZXQubGVuZ3RoID09PSAwIHx8IHNlbGYubGVuZ3RoID09PSAwKSByZXR1cm4gMFxuXG4gIC8vIEZhdGFsIGVycm9yIGNvbmRpdGlvbnNcbiAgaWYgKHRhcmdldF9zdGFydCA8IDApIHtcbiAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcigndGFyZ2V0U3RhcnQgb3V0IG9mIGJvdW5kcycpXG4gIH1cbiAgaWYgKHN0YXJ0IDwgMCB8fCBzdGFydCA+PSBzZWxmLmxlbmd0aCkgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ3NvdXJjZVN0YXJ0IG91dCBvZiBib3VuZHMnKVxuICBpZiAoZW5kIDwgMCkgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ3NvdXJjZUVuZCBvdXQgb2YgYm91bmRzJylcblxuICAvLyBBcmUgd2Ugb29iP1xuICBpZiAoZW5kID4gdGhpcy5sZW5ndGgpIGVuZCA9IHRoaXMubGVuZ3RoXG4gIGlmICh0YXJnZXQubGVuZ3RoIC0gdGFyZ2V0X3N0YXJ0IDwgZW5kIC0gc3RhcnQpIHtcbiAgICBlbmQgPSB0YXJnZXQubGVuZ3RoIC0gdGFyZ2V0X3N0YXJ0ICsgc3RhcnRcbiAgfVxuXG4gIHZhciBsZW4gPSBlbmQgLSBzdGFydFxuXG4gIGlmIChsZW4gPCAxMDAwIHx8ICFCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkge1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgIHRhcmdldFtpICsgdGFyZ2V0X3N0YXJ0XSA9IHRoaXNbaSArIHN0YXJ0XVxuICAgIH1cbiAgfSBlbHNlIHtcbiAgICB0YXJnZXQuX3NldCh0aGlzLnN1YmFycmF5KHN0YXJ0LCBzdGFydCArIGxlbiksIHRhcmdldF9zdGFydClcbiAgfVxuXG4gIHJldHVybiBsZW5cbn1cblxuLy8gZmlsbCh2YWx1ZSwgc3RhcnQ9MCwgZW5kPWJ1ZmZlci5sZW5ndGgpXG5CdWZmZXIucHJvdG90eXBlLmZpbGwgPSBmdW5jdGlvbiBmaWxsICh2YWx1ZSwgc3RhcnQsIGVuZCkge1xuICBpZiAoIXZhbHVlKSB2YWx1ZSA9IDBcbiAgaWYgKCFzdGFydCkgc3RhcnQgPSAwXG4gIGlmICghZW5kKSBlbmQgPSB0aGlzLmxlbmd0aFxuXG4gIGlmIChlbmQgPCBzdGFydCkgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ2VuZCA8IHN0YXJ0JylcblxuICAvLyBGaWxsIDAgYnl0ZXM7IHdlJ3JlIGRvbmVcbiAgaWYgKGVuZCA9PT0gc3RhcnQpIHJldHVyblxuICBpZiAodGhpcy5sZW5ndGggPT09IDApIHJldHVyblxuXG4gIGlmIChzdGFydCA8IDAgfHwgc3RhcnQgPj0gdGhpcy5sZW5ndGgpIHRocm93IG5ldyBSYW5nZUVycm9yKCdzdGFydCBvdXQgb2YgYm91bmRzJylcbiAgaWYgKGVuZCA8IDAgfHwgZW5kID4gdGhpcy5sZW5ndGgpIHRocm93IG5ldyBSYW5nZUVycm9yKCdlbmQgb3V0IG9mIGJvdW5kcycpXG5cbiAgdmFyIGlcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicpIHtcbiAgICBmb3IgKGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKSB7XG4gICAgICB0aGlzW2ldID0gdmFsdWVcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgdmFyIGJ5dGVzID0gdXRmOFRvQnl0ZXModmFsdWUudG9TdHJpbmcoKSlcbiAgICB2YXIgbGVuID0gYnl0ZXMubGVuZ3RoXG4gICAgZm9yIChpID0gc3RhcnQ7IGkgPCBlbmQ7IGkrKykge1xuICAgICAgdGhpc1tpXSA9IGJ5dGVzW2kgJSBsZW5dXG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHRoaXNcbn1cblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IGBBcnJheUJ1ZmZlcmAgd2l0aCB0aGUgKmNvcGllZCogbWVtb3J5IG9mIHRoZSBidWZmZXIgaW5zdGFuY2UuXG4gKiBBZGRlZCBpbiBOb2RlIDAuMTIuIE9ubHkgYXZhaWxhYmxlIGluIGJyb3dzZXJzIHRoYXQgc3VwcG9ydCBBcnJheUJ1ZmZlci5cbiAqL1xuQnVmZmVyLnByb3RvdHlwZS50b0FycmF5QnVmZmVyID0gZnVuY3Rpb24gdG9BcnJheUJ1ZmZlciAoKSB7XG4gIGlmICh0eXBlb2YgVWludDhBcnJheSAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICBpZiAoQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQpIHtcbiAgICAgIHJldHVybiAobmV3IEJ1ZmZlcih0aGlzKSkuYnVmZmVyXG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciBidWYgPSBuZXcgVWludDhBcnJheSh0aGlzLmxlbmd0aClcbiAgICAgIGZvciAodmFyIGkgPSAwLCBsZW4gPSBidWYubGVuZ3RoOyBpIDwgbGVuOyBpICs9IDEpIHtcbiAgICAgICAgYnVmW2ldID0gdGhpc1tpXVxuICAgICAgfVxuICAgICAgcmV0dXJuIGJ1Zi5idWZmZXJcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcignQnVmZmVyLnRvQXJyYXlCdWZmZXIgbm90IHN1cHBvcnRlZCBpbiB0aGlzIGJyb3dzZXInKVxuICB9XG59XG5cbi8vIEhFTFBFUiBGVU5DVElPTlNcbi8vID09PT09PT09PT09PT09PT1cblxudmFyIEJQID0gQnVmZmVyLnByb3RvdHlwZVxuXG4vKipcbiAqIEF1Z21lbnQgYSBVaW50OEFycmF5ICppbnN0YW5jZSogKG5vdCB0aGUgVWludDhBcnJheSBjbGFzcyEpIHdpdGggQnVmZmVyIG1ldGhvZHNcbiAqL1xuQnVmZmVyLl9hdWdtZW50ID0gZnVuY3Rpb24gX2F1Z21lbnQgKGFycikge1xuICBhcnIuY29uc3RydWN0b3IgPSBCdWZmZXJcbiAgYXJyLl9pc0J1ZmZlciA9IHRydWVcblxuICAvLyBzYXZlIHJlZmVyZW5jZSB0byBvcmlnaW5hbCBVaW50OEFycmF5IGdldC9zZXQgbWV0aG9kcyBiZWZvcmUgb3ZlcndyaXRpbmdcbiAgYXJyLl9nZXQgPSBhcnIuZ2V0XG4gIGFyci5fc2V0ID0gYXJyLnNldFxuXG4gIC8vIGRlcHJlY2F0ZWQsIHdpbGwgYmUgcmVtb3ZlZCBpbiBub2RlIDAuMTMrXG4gIGFyci5nZXQgPSBCUC5nZXRcbiAgYXJyLnNldCA9IEJQLnNldFxuXG4gIGFyci53cml0ZSA9IEJQLndyaXRlXG4gIGFyci50b1N0cmluZyA9IEJQLnRvU3RyaW5nXG4gIGFyci50b0xvY2FsZVN0cmluZyA9IEJQLnRvU3RyaW5nXG4gIGFyci50b0pTT04gPSBCUC50b0pTT05cbiAgYXJyLmVxdWFscyA9IEJQLmVxdWFsc1xuICBhcnIuY29tcGFyZSA9IEJQLmNvbXBhcmVcbiAgYXJyLmluZGV4T2YgPSBCUC5pbmRleE9mXG4gIGFyci5jb3B5ID0gQlAuY29weVxuICBhcnIuc2xpY2UgPSBCUC5zbGljZVxuICBhcnIucmVhZFVJbnRMRSA9IEJQLnJlYWRVSW50TEVcbiAgYXJyLnJlYWRVSW50QkUgPSBCUC5yZWFkVUludEJFXG4gIGFyci5yZWFkVUludDggPSBCUC5yZWFkVUludDhcbiAgYXJyLnJlYWRVSW50MTZMRSA9IEJQLnJlYWRVSW50MTZMRVxuICBhcnIucmVhZFVJbnQxNkJFID0gQlAucmVhZFVJbnQxNkJFXG4gIGFyci5yZWFkVUludDMyTEUgPSBCUC5yZWFkVUludDMyTEVcbiAgYXJyLnJlYWRVSW50MzJCRSA9IEJQLnJlYWRVSW50MzJCRVxuICBhcnIucmVhZEludExFID0gQlAucmVhZEludExFXG4gIGFyci5yZWFkSW50QkUgPSBCUC5yZWFkSW50QkVcbiAgYXJyLnJlYWRJbnQ4ID0gQlAucmVhZEludDhcbiAgYXJyLnJlYWRJbnQxNkxFID0gQlAucmVhZEludDE2TEVcbiAgYXJyLnJlYWRJbnQxNkJFID0gQlAucmVhZEludDE2QkVcbiAgYXJyLnJlYWRJbnQzMkxFID0gQlAucmVhZEludDMyTEVcbiAgYXJyLnJlYWRJbnQzMkJFID0gQlAucmVhZEludDMyQkVcbiAgYXJyLnJlYWRGbG9hdExFID0gQlAucmVhZEZsb2F0TEVcbiAgYXJyLnJlYWRGbG9hdEJFID0gQlAucmVhZEZsb2F0QkVcbiAgYXJyLnJlYWREb3VibGVMRSA9IEJQLnJlYWREb3VibGVMRVxuICBhcnIucmVhZERvdWJsZUJFID0gQlAucmVhZERvdWJsZUJFXG4gIGFyci53cml0ZVVJbnQ4ID0gQlAud3JpdGVVSW50OFxuICBhcnIud3JpdGVVSW50TEUgPSBCUC53cml0ZVVJbnRMRVxuICBhcnIud3JpdGVVSW50QkUgPSBCUC53cml0ZVVJbnRCRVxuICBhcnIud3JpdGVVSW50MTZMRSA9IEJQLndyaXRlVUludDE2TEVcbiAgYXJyLndyaXRlVUludDE2QkUgPSBCUC53cml0ZVVJbnQxNkJFXG4gIGFyci53cml0ZVVJbnQzMkxFID0gQlAud3JpdGVVSW50MzJMRVxuICBhcnIud3JpdGVVSW50MzJCRSA9IEJQLndyaXRlVUludDMyQkVcbiAgYXJyLndyaXRlSW50TEUgPSBCUC53cml0ZUludExFXG4gIGFyci53cml0ZUludEJFID0gQlAud3JpdGVJbnRCRVxuICBhcnIud3JpdGVJbnQ4ID0gQlAud3JpdGVJbnQ4XG4gIGFyci53cml0ZUludDE2TEUgPSBCUC53cml0ZUludDE2TEVcbiAgYXJyLndyaXRlSW50MTZCRSA9IEJQLndyaXRlSW50MTZCRVxuICBhcnIud3JpdGVJbnQzMkxFID0gQlAud3JpdGVJbnQzMkxFXG4gIGFyci53cml0ZUludDMyQkUgPSBCUC53cml0ZUludDMyQkVcbiAgYXJyLndyaXRlRmxvYXRMRSA9IEJQLndyaXRlRmxvYXRMRVxuICBhcnIud3JpdGVGbG9hdEJFID0gQlAud3JpdGVGbG9hdEJFXG4gIGFyci53cml0ZURvdWJsZUxFID0gQlAud3JpdGVEb3VibGVMRVxuICBhcnIud3JpdGVEb3VibGVCRSA9IEJQLndyaXRlRG91YmxlQkVcbiAgYXJyLmZpbGwgPSBCUC5maWxsXG4gIGFyci5pbnNwZWN0ID0gQlAuaW5zcGVjdFxuICBhcnIudG9BcnJheUJ1ZmZlciA9IEJQLnRvQXJyYXlCdWZmZXJcblxuICByZXR1cm4gYXJyXG59XG5cbnZhciBJTlZBTElEX0JBU0U2NF9SRSA9IC9bXitcXC8wLTlBLXpcXC1dL2dcblxuZnVuY3Rpb24gYmFzZTY0Y2xlYW4gKHN0cikge1xuICAvLyBOb2RlIHN0cmlwcyBvdXQgaW52YWxpZCBjaGFyYWN0ZXJzIGxpa2UgXFxuIGFuZCBcXHQgZnJvbSB0aGUgc3RyaW5nLCBiYXNlNjQtanMgZG9lcyBub3RcbiAgc3RyID0gc3RyaW5ndHJpbShzdHIpLnJlcGxhY2UoSU5WQUxJRF9CQVNFNjRfUkUsICcnKVxuICAvLyBOb2RlIGNvbnZlcnRzIHN0cmluZ3Mgd2l0aCBsZW5ndGggPCAyIHRvICcnXG4gIGlmIChzdHIubGVuZ3RoIDwgMikgcmV0dXJuICcnXG4gIC8vIE5vZGUgYWxsb3dzIGZvciBub24tcGFkZGVkIGJhc2U2NCBzdHJpbmdzIChtaXNzaW5nIHRyYWlsaW5nID09PSksIGJhc2U2NC1qcyBkb2VzIG5vdFxuICB3aGlsZSAoc3RyLmxlbmd0aCAlIDQgIT09IDApIHtcbiAgICBzdHIgPSBzdHIgKyAnPSdcbiAgfVxuICByZXR1cm4gc3RyXG59XG5cbmZ1bmN0aW9uIHN0cmluZ3RyaW0gKHN0cikge1xuICBpZiAoc3RyLnRyaW0pIHJldHVybiBzdHIudHJpbSgpXG4gIHJldHVybiBzdHIucmVwbGFjZSgvXlxccyt8XFxzKyQvZywgJycpXG59XG5cbmZ1bmN0aW9uIGlzQXJyYXlpc2ggKHN1YmplY3QpIHtcbiAgcmV0dXJuIGlzQXJyYXkoc3ViamVjdCkgfHwgQnVmZmVyLmlzQnVmZmVyKHN1YmplY3QpIHx8XG4gICAgICBzdWJqZWN0ICYmIHR5cGVvZiBzdWJqZWN0ID09PSAnb2JqZWN0JyAmJlxuICAgICAgdHlwZW9mIHN1YmplY3QubGVuZ3RoID09PSAnbnVtYmVyJ1xufVxuXG5mdW5jdGlvbiB0b0hleCAobikge1xuICBpZiAobiA8IDE2KSByZXR1cm4gJzAnICsgbi50b1N0cmluZygxNilcbiAgcmV0dXJuIG4udG9TdHJpbmcoMTYpXG59XG5cbmZ1bmN0aW9uIHV0ZjhUb0J5dGVzIChzdHJpbmcsIHVuaXRzKSB7XG4gIHVuaXRzID0gdW5pdHMgfHwgSW5maW5pdHlcbiAgdmFyIGNvZGVQb2ludFxuICB2YXIgbGVuZ3RoID0gc3RyaW5nLmxlbmd0aFxuICB2YXIgbGVhZFN1cnJvZ2F0ZSA9IG51bGxcbiAgdmFyIGJ5dGVzID0gW11cbiAgdmFyIGkgPSAwXG5cbiAgZm9yICg7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgIGNvZGVQb2ludCA9IHN0cmluZy5jaGFyQ29kZUF0KGkpXG5cbiAgICAvLyBpcyBzdXJyb2dhdGUgY29tcG9uZW50XG4gICAgaWYgKGNvZGVQb2ludCA+IDB4RDdGRiAmJiBjb2RlUG9pbnQgPCAweEUwMDApIHtcbiAgICAgIC8vIGxhc3QgY2hhciB3YXMgYSBsZWFkXG4gICAgICBpZiAobGVhZFN1cnJvZ2F0ZSkge1xuICAgICAgICAvLyAyIGxlYWRzIGluIGEgcm93XG4gICAgICAgIGlmIChjb2RlUG9pbnQgPCAweERDMDApIHtcbiAgICAgICAgICBpZiAoKHVuaXRzIC09IDMpID4gLTEpIGJ5dGVzLnB1c2goMHhFRiwgMHhCRiwgMHhCRClcbiAgICAgICAgICBsZWFkU3Vycm9nYXRlID0gY29kZVBvaW50XG4gICAgICAgICAgY29udGludWVcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyB2YWxpZCBzdXJyb2dhdGUgcGFpclxuICAgICAgICAgIGNvZGVQb2ludCA9IGxlYWRTdXJyb2dhdGUgLSAweEQ4MDAgPDwgMTAgfCBjb2RlUG9pbnQgLSAweERDMDAgfCAweDEwMDAwXG4gICAgICAgICAgbGVhZFN1cnJvZ2F0ZSA9IG51bGxcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gbm8gbGVhZCB5ZXRcblxuICAgICAgICBpZiAoY29kZVBvaW50ID4gMHhEQkZGKSB7XG4gICAgICAgICAgLy8gdW5leHBlY3RlZCB0cmFpbFxuICAgICAgICAgIGlmICgodW5pdHMgLT0gMykgPiAtMSkgYnl0ZXMucHVzaCgweEVGLCAweEJGLCAweEJEKVxuICAgICAgICAgIGNvbnRpbnVlXG4gICAgICAgIH0gZWxzZSBpZiAoaSArIDEgPT09IGxlbmd0aCkge1xuICAgICAgICAgIC8vIHVucGFpcmVkIGxlYWRcbiAgICAgICAgICBpZiAoKHVuaXRzIC09IDMpID4gLTEpIGJ5dGVzLnB1c2goMHhFRiwgMHhCRiwgMHhCRClcbiAgICAgICAgICBjb250aW51ZVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIHZhbGlkIGxlYWRcbiAgICAgICAgICBsZWFkU3Vycm9nYXRlID0gY29kZVBvaW50XG4gICAgICAgICAgY29udGludWVcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSBpZiAobGVhZFN1cnJvZ2F0ZSkge1xuICAgICAgLy8gdmFsaWQgYm1wIGNoYXIsIGJ1dCBsYXN0IGNoYXIgd2FzIGEgbGVhZFxuICAgICAgaWYgKCh1bml0cyAtPSAzKSA+IC0xKSBieXRlcy5wdXNoKDB4RUYsIDB4QkYsIDB4QkQpXG4gICAgICBsZWFkU3Vycm9nYXRlID0gbnVsbFxuICAgIH1cblxuICAgIC8vIGVuY29kZSB1dGY4XG4gICAgaWYgKGNvZGVQb2ludCA8IDB4ODApIHtcbiAgICAgIGlmICgodW5pdHMgLT0gMSkgPCAwKSBicmVha1xuICAgICAgYnl0ZXMucHVzaChjb2RlUG9pbnQpXG4gICAgfSBlbHNlIGlmIChjb2RlUG9pbnQgPCAweDgwMCkge1xuICAgICAgaWYgKCh1bml0cyAtPSAyKSA8IDApIGJyZWFrXG4gICAgICBieXRlcy5wdXNoKFxuICAgICAgICBjb2RlUG9pbnQgPj4gMHg2IHwgMHhDMCxcbiAgICAgICAgY29kZVBvaW50ICYgMHgzRiB8IDB4ODBcbiAgICAgIClcbiAgICB9IGVsc2UgaWYgKGNvZGVQb2ludCA8IDB4MTAwMDApIHtcbiAgICAgIGlmICgodW5pdHMgLT0gMykgPCAwKSBicmVha1xuICAgICAgYnl0ZXMucHVzaChcbiAgICAgICAgY29kZVBvaW50ID4+IDB4QyB8IDB4RTAsXG4gICAgICAgIGNvZGVQb2ludCA+PiAweDYgJiAweDNGIHwgMHg4MCxcbiAgICAgICAgY29kZVBvaW50ICYgMHgzRiB8IDB4ODBcbiAgICAgIClcbiAgICB9IGVsc2UgaWYgKGNvZGVQb2ludCA8IDB4MjAwMDAwKSB7XG4gICAgICBpZiAoKHVuaXRzIC09IDQpIDwgMCkgYnJlYWtcbiAgICAgIGJ5dGVzLnB1c2goXG4gICAgICAgIGNvZGVQb2ludCA+PiAweDEyIHwgMHhGMCxcbiAgICAgICAgY29kZVBvaW50ID4+IDB4QyAmIDB4M0YgfCAweDgwLFxuICAgICAgICBjb2RlUG9pbnQgPj4gMHg2ICYgMHgzRiB8IDB4ODAsXG4gICAgICAgIGNvZGVQb2ludCAmIDB4M0YgfCAweDgwXG4gICAgICApXG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBjb2RlIHBvaW50JylcbiAgICB9XG4gIH1cblxuICByZXR1cm4gYnl0ZXNcbn1cblxuZnVuY3Rpb24gYXNjaWlUb0J5dGVzIChzdHIpIHtcbiAgdmFyIGJ5dGVBcnJheSA9IFtdXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgc3RyLmxlbmd0aDsgaSsrKSB7XG4gICAgLy8gTm9kZSdzIGNvZGUgc2VlbXMgdG8gYmUgZG9pbmcgdGhpcyBhbmQgbm90ICYgMHg3Ri4uXG4gICAgYnl0ZUFycmF5LnB1c2goc3RyLmNoYXJDb2RlQXQoaSkgJiAweEZGKVxuICB9XG4gIHJldHVybiBieXRlQXJyYXlcbn1cblxuZnVuY3Rpb24gdXRmMTZsZVRvQnl0ZXMgKHN0ciwgdW5pdHMpIHtcbiAgdmFyIGMsIGhpLCBsb1xuICB2YXIgYnl0ZUFycmF5ID0gW11cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBzdHIubGVuZ3RoOyBpKyspIHtcbiAgICBpZiAoKHVuaXRzIC09IDIpIDwgMCkgYnJlYWtcblxuICAgIGMgPSBzdHIuY2hhckNvZGVBdChpKVxuICAgIGhpID0gYyA+PiA4XG4gICAgbG8gPSBjICUgMjU2XG4gICAgYnl0ZUFycmF5LnB1c2gobG8pXG4gICAgYnl0ZUFycmF5LnB1c2goaGkpXG4gIH1cblxuICByZXR1cm4gYnl0ZUFycmF5XG59XG5cbmZ1bmN0aW9uIGJhc2U2NFRvQnl0ZXMgKHN0cikge1xuICByZXR1cm4gYmFzZTY0LnRvQnl0ZUFycmF5KGJhc2U2NGNsZWFuKHN0cikpXG59XG5cbmZ1bmN0aW9uIGJsaXRCdWZmZXIgKHNyYywgZHN0LCBvZmZzZXQsIGxlbmd0aCkge1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgaWYgKChpICsgb2Zmc2V0ID49IGRzdC5sZW5ndGgpIHx8IChpID49IHNyYy5sZW5ndGgpKSBicmVha1xuICAgIGRzdFtpICsgb2Zmc2V0XSA9IHNyY1tpXVxuICB9XG4gIHJldHVybiBpXG59XG5cbmZ1bmN0aW9uIGRlY29kZVV0ZjhDaGFyIChzdHIpIHtcbiAgdHJ5IHtcbiAgICByZXR1cm4gZGVjb2RlVVJJQ29tcG9uZW50KHN0cilcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgcmV0dXJuIFN0cmluZy5mcm9tQ2hhckNvZGUoMHhGRkZEKSAvLyBVVEYgOCBpbnZhbGlkIGNoYXJcbiAgfVxufVxuIiwidmFyIGxvb2t1cCA9ICdBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWmFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6MDEyMzQ1Njc4OSsvJztcblxuOyhmdW5jdGlvbiAoZXhwb3J0cykge1xuXHQndXNlIHN0cmljdCc7XG5cbiAgdmFyIEFyciA9ICh0eXBlb2YgVWludDhBcnJheSAhPT0gJ3VuZGVmaW5lZCcpXG4gICAgPyBVaW50OEFycmF5XG4gICAgOiBBcnJheVxuXG5cdHZhciBQTFVTICAgPSAnKycuY2hhckNvZGVBdCgwKVxuXHR2YXIgU0xBU0ggID0gJy8nLmNoYXJDb2RlQXQoMClcblx0dmFyIE5VTUJFUiA9ICcwJy5jaGFyQ29kZUF0KDApXG5cdHZhciBMT1dFUiAgPSAnYScuY2hhckNvZGVBdCgwKVxuXHR2YXIgVVBQRVIgID0gJ0EnLmNoYXJDb2RlQXQoMClcblx0dmFyIFBMVVNfVVJMX1NBRkUgPSAnLScuY2hhckNvZGVBdCgwKVxuXHR2YXIgU0xBU0hfVVJMX1NBRkUgPSAnXycuY2hhckNvZGVBdCgwKVxuXG5cdGZ1bmN0aW9uIGRlY29kZSAoZWx0KSB7XG5cdFx0dmFyIGNvZGUgPSBlbHQuY2hhckNvZGVBdCgwKVxuXHRcdGlmIChjb2RlID09PSBQTFVTIHx8XG5cdFx0ICAgIGNvZGUgPT09IFBMVVNfVVJMX1NBRkUpXG5cdFx0XHRyZXR1cm4gNjIgLy8gJysnXG5cdFx0aWYgKGNvZGUgPT09IFNMQVNIIHx8XG5cdFx0ICAgIGNvZGUgPT09IFNMQVNIX1VSTF9TQUZFKVxuXHRcdFx0cmV0dXJuIDYzIC8vICcvJ1xuXHRcdGlmIChjb2RlIDwgTlVNQkVSKVxuXHRcdFx0cmV0dXJuIC0xIC8vbm8gbWF0Y2hcblx0XHRpZiAoY29kZSA8IE5VTUJFUiArIDEwKVxuXHRcdFx0cmV0dXJuIGNvZGUgLSBOVU1CRVIgKyAyNiArIDI2XG5cdFx0aWYgKGNvZGUgPCBVUFBFUiArIDI2KVxuXHRcdFx0cmV0dXJuIGNvZGUgLSBVUFBFUlxuXHRcdGlmIChjb2RlIDwgTE9XRVIgKyAyNilcblx0XHRcdHJldHVybiBjb2RlIC0gTE9XRVIgKyAyNlxuXHR9XG5cblx0ZnVuY3Rpb24gYjY0VG9CeXRlQXJyYXkgKGI2NCkge1xuXHRcdHZhciBpLCBqLCBsLCB0bXAsIHBsYWNlSG9sZGVycywgYXJyXG5cblx0XHRpZiAoYjY0Lmxlbmd0aCAlIDQgPiAwKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgc3RyaW5nLiBMZW5ndGggbXVzdCBiZSBhIG11bHRpcGxlIG9mIDQnKVxuXHRcdH1cblxuXHRcdC8vIHRoZSBudW1iZXIgb2YgZXF1YWwgc2lnbnMgKHBsYWNlIGhvbGRlcnMpXG5cdFx0Ly8gaWYgdGhlcmUgYXJlIHR3byBwbGFjZWhvbGRlcnMsIHRoYW4gdGhlIHR3byBjaGFyYWN0ZXJzIGJlZm9yZSBpdFxuXHRcdC8vIHJlcHJlc2VudCBvbmUgYnl0ZVxuXHRcdC8vIGlmIHRoZXJlIGlzIG9ubHkgb25lLCB0aGVuIHRoZSB0aHJlZSBjaGFyYWN0ZXJzIGJlZm9yZSBpdCByZXByZXNlbnQgMiBieXRlc1xuXHRcdC8vIHRoaXMgaXMganVzdCBhIGNoZWFwIGhhY2sgdG8gbm90IGRvIGluZGV4T2YgdHdpY2Vcblx0XHR2YXIgbGVuID0gYjY0Lmxlbmd0aFxuXHRcdHBsYWNlSG9sZGVycyA9ICc9JyA9PT0gYjY0LmNoYXJBdChsZW4gLSAyKSA/IDIgOiAnPScgPT09IGI2NC5jaGFyQXQobGVuIC0gMSkgPyAxIDogMFxuXG5cdFx0Ly8gYmFzZTY0IGlzIDQvMyArIHVwIHRvIHR3byBjaGFyYWN0ZXJzIG9mIHRoZSBvcmlnaW5hbCBkYXRhXG5cdFx0YXJyID0gbmV3IEFycihiNjQubGVuZ3RoICogMyAvIDQgLSBwbGFjZUhvbGRlcnMpXG5cblx0XHQvLyBpZiB0aGVyZSBhcmUgcGxhY2Vob2xkZXJzLCBvbmx5IGdldCB1cCB0byB0aGUgbGFzdCBjb21wbGV0ZSA0IGNoYXJzXG5cdFx0bCA9IHBsYWNlSG9sZGVycyA+IDAgPyBiNjQubGVuZ3RoIC0gNCA6IGI2NC5sZW5ndGhcblxuXHRcdHZhciBMID0gMFxuXG5cdFx0ZnVuY3Rpb24gcHVzaCAodikge1xuXHRcdFx0YXJyW0wrK10gPSB2XG5cdFx0fVxuXG5cdFx0Zm9yIChpID0gMCwgaiA9IDA7IGkgPCBsOyBpICs9IDQsIGogKz0gMykge1xuXHRcdFx0dG1wID0gKGRlY29kZShiNjQuY2hhckF0KGkpKSA8PCAxOCkgfCAoZGVjb2RlKGI2NC5jaGFyQXQoaSArIDEpKSA8PCAxMikgfCAoZGVjb2RlKGI2NC5jaGFyQXQoaSArIDIpKSA8PCA2KSB8IGRlY29kZShiNjQuY2hhckF0KGkgKyAzKSlcblx0XHRcdHB1c2goKHRtcCAmIDB4RkYwMDAwKSA+PiAxNilcblx0XHRcdHB1c2goKHRtcCAmIDB4RkYwMCkgPj4gOClcblx0XHRcdHB1c2godG1wICYgMHhGRilcblx0XHR9XG5cblx0XHRpZiAocGxhY2VIb2xkZXJzID09PSAyKSB7XG5cdFx0XHR0bXAgPSAoZGVjb2RlKGI2NC5jaGFyQXQoaSkpIDw8IDIpIHwgKGRlY29kZShiNjQuY2hhckF0KGkgKyAxKSkgPj4gNClcblx0XHRcdHB1c2godG1wICYgMHhGRilcblx0XHR9IGVsc2UgaWYgKHBsYWNlSG9sZGVycyA9PT0gMSkge1xuXHRcdFx0dG1wID0gKGRlY29kZShiNjQuY2hhckF0KGkpKSA8PCAxMCkgfCAoZGVjb2RlKGI2NC5jaGFyQXQoaSArIDEpKSA8PCA0KSB8IChkZWNvZGUoYjY0LmNoYXJBdChpICsgMikpID4+IDIpXG5cdFx0XHRwdXNoKCh0bXAgPj4gOCkgJiAweEZGKVxuXHRcdFx0cHVzaCh0bXAgJiAweEZGKVxuXHRcdH1cblxuXHRcdHJldHVybiBhcnJcblx0fVxuXG5cdGZ1bmN0aW9uIHVpbnQ4VG9CYXNlNjQgKHVpbnQ4KSB7XG5cdFx0dmFyIGksXG5cdFx0XHRleHRyYUJ5dGVzID0gdWludDgubGVuZ3RoICUgMywgLy8gaWYgd2UgaGF2ZSAxIGJ5dGUgbGVmdCwgcGFkIDIgYnl0ZXNcblx0XHRcdG91dHB1dCA9IFwiXCIsXG5cdFx0XHR0ZW1wLCBsZW5ndGhcblxuXHRcdGZ1bmN0aW9uIGVuY29kZSAobnVtKSB7XG5cdFx0XHRyZXR1cm4gbG9va3VwLmNoYXJBdChudW0pXG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gdHJpcGxldFRvQmFzZTY0IChudW0pIHtcblx0XHRcdHJldHVybiBlbmNvZGUobnVtID4+IDE4ICYgMHgzRikgKyBlbmNvZGUobnVtID4+IDEyICYgMHgzRikgKyBlbmNvZGUobnVtID4+IDYgJiAweDNGKSArIGVuY29kZShudW0gJiAweDNGKVxuXHRcdH1cblxuXHRcdC8vIGdvIHRocm91Z2ggdGhlIGFycmF5IGV2ZXJ5IHRocmVlIGJ5dGVzLCB3ZSdsbCBkZWFsIHdpdGggdHJhaWxpbmcgc3R1ZmYgbGF0ZXJcblx0XHRmb3IgKGkgPSAwLCBsZW5ndGggPSB1aW50OC5sZW5ndGggLSBleHRyYUJ5dGVzOyBpIDwgbGVuZ3RoOyBpICs9IDMpIHtcblx0XHRcdHRlbXAgPSAodWludDhbaV0gPDwgMTYpICsgKHVpbnQ4W2kgKyAxXSA8PCA4KSArICh1aW50OFtpICsgMl0pXG5cdFx0XHRvdXRwdXQgKz0gdHJpcGxldFRvQmFzZTY0KHRlbXApXG5cdFx0fVxuXG5cdFx0Ly8gcGFkIHRoZSBlbmQgd2l0aCB6ZXJvcywgYnV0IG1ha2Ugc3VyZSB0byBub3QgZm9yZ2V0IHRoZSBleHRyYSBieXRlc1xuXHRcdHN3aXRjaCAoZXh0cmFCeXRlcykge1xuXHRcdFx0Y2FzZSAxOlxuXHRcdFx0XHR0ZW1wID0gdWludDhbdWludDgubGVuZ3RoIC0gMV1cblx0XHRcdFx0b3V0cHV0ICs9IGVuY29kZSh0ZW1wID4+IDIpXG5cdFx0XHRcdG91dHB1dCArPSBlbmNvZGUoKHRlbXAgPDwgNCkgJiAweDNGKVxuXHRcdFx0XHRvdXRwdXQgKz0gJz09J1xuXHRcdFx0XHRicmVha1xuXHRcdFx0Y2FzZSAyOlxuXHRcdFx0XHR0ZW1wID0gKHVpbnQ4W3VpbnQ4Lmxlbmd0aCAtIDJdIDw8IDgpICsgKHVpbnQ4W3VpbnQ4Lmxlbmd0aCAtIDFdKVxuXHRcdFx0XHRvdXRwdXQgKz0gZW5jb2RlKHRlbXAgPj4gMTApXG5cdFx0XHRcdG91dHB1dCArPSBlbmNvZGUoKHRlbXAgPj4gNCkgJiAweDNGKVxuXHRcdFx0XHRvdXRwdXQgKz0gZW5jb2RlKCh0ZW1wIDw8IDIpICYgMHgzRilcblx0XHRcdFx0b3V0cHV0ICs9ICc9J1xuXHRcdFx0XHRicmVha1xuXHRcdH1cblxuXHRcdHJldHVybiBvdXRwdXRcblx0fVxuXG5cdGV4cG9ydHMudG9CeXRlQXJyYXkgPSBiNjRUb0J5dGVBcnJheVxuXHRleHBvcnRzLmZyb21CeXRlQXJyYXkgPSB1aW50OFRvQmFzZTY0XG59KHR5cGVvZiBleHBvcnRzID09PSAndW5kZWZpbmVkJyA/ICh0aGlzLmJhc2U2NGpzID0ge30pIDogZXhwb3J0cykpXG4iLCJleHBvcnRzLnJlYWQgPSBmdW5jdGlvbihidWZmZXIsIG9mZnNldCwgaXNMRSwgbUxlbiwgbkJ5dGVzKSB7XG4gIHZhciBlLCBtLFxuICAgICAgZUxlbiA9IG5CeXRlcyAqIDggLSBtTGVuIC0gMSxcbiAgICAgIGVNYXggPSAoMSA8PCBlTGVuKSAtIDEsXG4gICAgICBlQmlhcyA9IGVNYXggPj4gMSxcbiAgICAgIG5CaXRzID0gLTcsXG4gICAgICBpID0gaXNMRSA/IChuQnl0ZXMgLSAxKSA6IDAsXG4gICAgICBkID0gaXNMRSA/IC0xIDogMSxcbiAgICAgIHMgPSBidWZmZXJbb2Zmc2V0ICsgaV07XG5cbiAgaSArPSBkO1xuXG4gIGUgPSBzICYgKCgxIDw8ICgtbkJpdHMpKSAtIDEpO1xuICBzID4+PSAoLW5CaXRzKTtcbiAgbkJpdHMgKz0gZUxlbjtcbiAgZm9yICg7IG5CaXRzID4gMDsgZSA9IGUgKiAyNTYgKyBidWZmZXJbb2Zmc2V0ICsgaV0sIGkgKz0gZCwgbkJpdHMgLT0gOCk7XG5cbiAgbSA9IGUgJiAoKDEgPDwgKC1uQml0cykpIC0gMSk7XG4gIGUgPj49ICgtbkJpdHMpO1xuICBuQml0cyArPSBtTGVuO1xuICBmb3IgKDsgbkJpdHMgPiAwOyBtID0gbSAqIDI1NiArIGJ1ZmZlcltvZmZzZXQgKyBpXSwgaSArPSBkLCBuQml0cyAtPSA4KTtcblxuICBpZiAoZSA9PT0gMCkge1xuICAgIGUgPSAxIC0gZUJpYXM7XG4gIH0gZWxzZSBpZiAoZSA9PT0gZU1heCkge1xuICAgIHJldHVybiBtID8gTmFOIDogKChzID8gLTEgOiAxKSAqIEluZmluaXR5KTtcbiAgfSBlbHNlIHtcbiAgICBtID0gbSArIE1hdGgucG93KDIsIG1MZW4pO1xuICAgIGUgPSBlIC0gZUJpYXM7XG4gIH1cbiAgcmV0dXJuIChzID8gLTEgOiAxKSAqIG0gKiBNYXRoLnBvdygyLCBlIC0gbUxlbik7XG59O1xuXG5leHBvcnRzLndyaXRlID0gZnVuY3Rpb24oYnVmZmVyLCB2YWx1ZSwgb2Zmc2V0LCBpc0xFLCBtTGVuLCBuQnl0ZXMpIHtcbiAgdmFyIGUsIG0sIGMsXG4gICAgICBlTGVuID0gbkJ5dGVzICogOCAtIG1MZW4gLSAxLFxuICAgICAgZU1heCA9ICgxIDw8IGVMZW4pIC0gMSxcbiAgICAgIGVCaWFzID0gZU1heCA+PiAxLFxuICAgICAgcnQgPSAobUxlbiA9PT0gMjMgPyBNYXRoLnBvdygyLCAtMjQpIC0gTWF0aC5wb3coMiwgLTc3KSA6IDApLFxuICAgICAgaSA9IGlzTEUgPyAwIDogKG5CeXRlcyAtIDEpLFxuICAgICAgZCA9IGlzTEUgPyAxIDogLTEsXG4gICAgICBzID0gdmFsdWUgPCAwIHx8ICh2YWx1ZSA9PT0gMCAmJiAxIC8gdmFsdWUgPCAwKSA/IDEgOiAwO1xuXG4gIHZhbHVlID0gTWF0aC5hYnModmFsdWUpO1xuXG4gIGlmIChpc05hTih2YWx1ZSkgfHwgdmFsdWUgPT09IEluZmluaXR5KSB7XG4gICAgbSA9IGlzTmFOKHZhbHVlKSA/IDEgOiAwO1xuICAgIGUgPSBlTWF4O1xuICB9IGVsc2Uge1xuICAgIGUgPSBNYXRoLmZsb29yKE1hdGgubG9nKHZhbHVlKSAvIE1hdGguTE4yKTtcbiAgICBpZiAodmFsdWUgKiAoYyA9IE1hdGgucG93KDIsIC1lKSkgPCAxKSB7XG4gICAgICBlLS07XG4gICAgICBjICo9IDI7XG4gICAgfVxuICAgIGlmIChlICsgZUJpYXMgPj0gMSkge1xuICAgICAgdmFsdWUgKz0gcnQgLyBjO1xuICAgIH0gZWxzZSB7XG4gICAgICB2YWx1ZSArPSBydCAqIE1hdGgucG93KDIsIDEgLSBlQmlhcyk7XG4gICAgfVxuICAgIGlmICh2YWx1ZSAqIGMgPj0gMikge1xuICAgICAgZSsrO1xuICAgICAgYyAvPSAyO1xuICAgIH1cblxuICAgIGlmIChlICsgZUJpYXMgPj0gZU1heCkge1xuICAgICAgbSA9IDA7XG4gICAgICBlID0gZU1heDtcbiAgICB9IGVsc2UgaWYgKGUgKyBlQmlhcyA+PSAxKSB7XG4gICAgICBtID0gKHZhbHVlICogYyAtIDEpICogTWF0aC5wb3coMiwgbUxlbik7XG4gICAgICBlID0gZSArIGVCaWFzO1xuICAgIH0gZWxzZSB7XG4gICAgICBtID0gdmFsdWUgKiBNYXRoLnBvdygyLCBlQmlhcyAtIDEpICogTWF0aC5wb3coMiwgbUxlbik7XG4gICAgICBlID0gMDtcbiAgICB9XG4gIH1cblxuICBmb3IgKDsgbUxlbiA+PSA4OyBidWZmZXJbb2Zmc2V0ICsgaV0gPSBtICYgMHhmZiwgaSArPSBkLCBtIC89IDI1NiwgbUxlbiAtPSA4KTtcblxuICBlID0gKGUgPDwgbUxlbikgfCBtO1xuICBlTGVuICs9IG1MZW47XG4gIGZvciAoOyBlTGVuID4gMDsgYnVmZmVyW29mZnNldCArIGldID0gZSAmIDB4ZmYsIGkgKz0gZCwgZSAvPSAyNTYsIGVMZW4gLT0gOCk7XG5cbiAgYnVmZmVyW29mZnNldCArIGkgLSBkXSB8PSBzICogMTI4O1xufTtcbiIsIlxuLyoqXG4gKiBpc0FycmF5XG4gKi9cblxudmFyIGlzQXJyYXkgPSBBcnJheS5pc0FycmF5O1xuXG4vKipcbiAqIHRvU3RyaW5nXG4gKi9cblxudmFyIHN0ciA9IE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmc7XG5cbi8qKlxuICogV2hldGhlciBvciBub3QgdGhlIGdpdmVuIGB2YWxgXG4gKiBpcyBhbiBhcnJheS5cbiAqXG4gKiBleGFtcGxlOlxuICpcbiAqICAgICAgICBpc0FycmF5KFtdKTtcbiAqICAgICAgICAvLyA+IHRydWVcbiAqICAgICAgICBpc0FycmF5KGFyZ3VtZW50cyk7XG4gKiAgICAgICAgLy8gPiBmYWxzZVxuICogICAgICAgIGlzQXJyYXkoJycpO1xuICogICAgICAgIC8vID4gZmFsc2VcbiAqXG4gKiBAcGFyYW0ge21peGVkfSB2YWxcbiAqIEByZXR1cm4ge2Jvb2x9XG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBpc0FycmF5IHx8IGZ1bmN0aW9uICh2YWwpIHtcbiAgcmV0dXJuICEhIHZhbCAmJiAnW29iamVjdCBBcnJheV0nID09IHN0ci5jYWxsKHZhbCk7XG59O1xuIiwiLy8gQ29weXJpZ2h0IEpveWVudCwgSW5jLiBhbmQgb3RoZXIgTm9kZSBjb250cmlidXRvcnMuXG4vL1xuLy8gUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGFcbi8vIGNvcHkgb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGVcbi8vIFwiU29mdHdhcmVcIiksIHRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZ1xuLy8gd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLFxuLy8gZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdFxuLy8gcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlXG4vLyBmb2xsb3dpbmcgY29uZGl0aW9uczpcbi8vXG4vLyBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZFxuLy8gaW4gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4vL1xuLy8gVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTU1xuLy8gT1IgSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRlxuLy8gTUVSQ0hBTlRBQklMSVRZLCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTlxuLy8gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sXG4vLyBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1Jcbi8vIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEVcbi8vIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXG5cbmZ1bmN0aW9uIEV2ZW50RW1pdHRlcigpIHtcbiAgdGhpcy5fZXZlbnRzID0gdGhpcy5fZXZlbnRzIHx8IHt9O1xuICB0aGlzLl9tYXhMaXN0ZW5lcnMgPSB0aGlzLl9tYXhMaXN0ZW5lcnMgfHwgdW5kZWZpbmVkO1xufVxubW9kdWxlLmV4cG9ydHMgPSBFdmVudEVtaXR0ZXI7XG5cbi8vIEJhY2t3YXJkcy1jb21wYXQgd2l0aCBub2RlIDAuMTAueFxuRXZlbnRFbWl0dGVyLkV2ZW50RW1pdHRlciA9IEV2ZW50RW1pdHRlcjtcblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5fZXZlbnRzID0gdW5kZWZpbmVkO1xuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5fbWF4TGlzdGVuZXJzID0gdW5kZWZpbmVkO1xuXG4vLyBCeSBkZWZhdWx0IEV2ZW50RW1pdHRlcnMgd2lsbCBwcmludCBhIHdhcm5pbmcgaWYgbW9yZSB0aGFuIDEwIGxpc3RlbmVycyBhcmVcbi8vIGFkZGVkIHRvIGl0LiBUaGlzIGlzIGEgdXNlZnVsIGRlZmF1bHQgd2hpY2ggaGVscHMgZmluZGluZyBtZW1vcnkgbGVha3MuXG5FdmVudEVtaXR0ZXIuZGVmYXVsdE1heExpc3RlbmVycyA9IDEwO1xuXG4vLyBPYnZpb3VzbHkgbm90IGFsbCBFbWl0dGVycyBzaG91bGQgYmUgbGltaXRlZCB0byAxMC4gVGhpcyBmdW5jdGlvbiBhbGxvd3Ncbi8vIHRoYXQgdG8gYmUgaW5jcmVhc2VkLiBTZXQgdG8gemVybyBmb3IgdW5saW1pdGVkLlxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5zZXRNYXhMaXN0ZW5lcnMgPSBmdW5jdGlvbihuKSB7XG4gIGlmICghaXNOdW1iZXIobikgfHwgbiA8IDAgfHwgaXNOYU4obikpXG4gICAgdGhyb3cgVHlwZUVycm9yKCduIG11c3QgYmUgYSBwb3NpdGl2ZSBudW1iZXInKTtcbiAgdGhpcy5fbWF4TGlzdGVuZXJzID0gbjtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLmVtaXQgPSBmdW5jdGlvbih0eXBlKSB7XG4gIHZhciBlciwgaGFuZGxlciwgbGVuLCBhcmdzLCBpLCBsaXN0ZW5lcnM7XG5cbiAgaWYgKCF0aGlzLl9ldmVudHMpXG4gICAgdGhpcy5fZXZlbnRzID0ge307XG5cbiAgLy8gSWYgdGhlcmUgaXMgbm8gJ2Vycm9yJyBldmVudCBsaXN0ZW5lciB0aGVuIHRocm93LlxuICBpZiAodHlwZSA9PT0gJ2Vycm9yJykge1xuICAgIGlmICghdGhpcy5fZXZlbnRzLmVycm9yIHx8XG4gICAgICAgIChpc09iamVjdCh0aGlzLl9ldmVudHMuZXJyb3IpICYmICF0aGlzLl9ldmVudHMuZXJyb3IubGVuZ3RoKSkge1xuICAgICAgZXIgPSBhcmd1bWVudHNbMV07XG4gICAgICBpZiAoZXIgaW5zdGFuY2VvZiBFcnJvcikge1xuICAgICAgICB0aHJvdyBlcjsgLy8gVW5oYW5kbGVkICdlcnJvcicgZXZlbnRcbiAgICAgIH1cbiAgICAgIHRocm93IFR5cGVFcnJvcignVW5jYXVnaHQsIHVuc3BlY2lmaWVkIFwiZXJyb3JcIiBldmVudC4nKTtcbiAgICB9XG4gIH1cblxuICBoYW5kbGVyID0gdGhpcy5fZXZlbnRzW3R5cGVdO1xuXG4gIGlmIChpc1VuZGVmaW5lZChoYW5kbGVyKSlcbiAgICByZXR1cm4gZmFsc2U7XG5cbiAgaWYgKGlzRnVuY3Rpb24oaGFuZGxlcikpIHtcbiAgICBzd2l0Y2ggKGFyZ3VtZW50cy5sZW5ndGgpIHtcbiAgICAgIC8vIGZhc3QgY2FzZXNcbiAgICAgIGNhc2UgMTpcbiAgICAgICAgaGFuZGxlci5jYWxsKHRoaXMpO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgMjpcbiAgICAgICAgaGFuZGxlci5jYWxsKHRoaXMsIGFyZ3VtZW50c1sxXSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAzOlxuICAgICAgICBoYW5kbGVyLmNhbGwodGhpcywgYXJndW1lbnRzWzFdLCBhcmd1bWVudHNbMl0pO1xuICAgICAgICBicmVhaztcbiAgICAgIC8vIHNsb3dlclxuICAgICAgZGVmYXVsdDpcbiAgICAgICAgbGVuID0gYXJndW1lbnRzLmxlbmd0aDtcbiAgICAgICAgYXJncyA9IG5ldyBBcnJheShsZW4gLSAxKTtcbiAgICAgICAgZm9yIChpID0gMTsgaSA8IGxlbjsgaSsrKVxuICAgICAgICAgIGFyZ3NbaSAtIDFdID0gYXJndW1lbnRzW2ldO1xuICAgICAgICBoYW5kbGVyLmFwcGx5KHRoaXMsIGFyZ3MpO1xuICAgIH1cbiAgfSBlbHNlIGlmIChpc09iamVjdChoYW5kbGVyKSkge1xuICAgIGxlbiA9IGFyZ3VtZW50cy5sZW5ndGg7XG4gICAgYXJncyA9IG5ldyBBcnJheShsZW4gLSAxKTtcbiAgICBmb3IgKGkgPSAxOyBpIDwgbGVuOyBpKyspXG4gICAgICBhcmdzW2kgLSAxXSA9IGFyZ3VtZW50c1tpXTtcblxuICAgIGxpc3RlbmVycyA9IGhhbmRsZXIuc2xpY2UoKTtcbiAgICBsZW4gPSBsaXN0ZW5lcnMubGVuZ3RoO1xuICAgIGZvciAoaSA9IDA7IGkgPCBsZW47IGkrKylcbiAgICAgIGxpc3RlbmVyc1tpXS5hcHBseSh0aGlzLCBhcmdzKTtcbiAgfVxuXG4gIHJldHVybiB0cnVlO1xufTtcblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5hZGRMaXN0ZW5lciA9IGZ1bmN0aW9uKHR5cGUsIGxpc3RlbmVyKSB7XG4gIHZhciBtO1xuXG4gIGlmICghaXNGdW5jdGlvbihsaXN0ZW5lcikpXG4gICAgdGhyb3cgVHlwZUVycm9yKCdsaXN0ZW5lciBtdXN0IGJlIGEgZnVuY3Rpb24nKTtcblxuICBpZiAoIXRoaXMuX2V2ZW50cylcbiAgICB0aGlzLl9ldmVudHMgPSB7fTtcblxuICAvLyBUbyBhdm9pZCByZWN1cnNpb24gaW4gdGhlIGNhc2UgdGhhdCB0eXBlID09PSBcIm5ld0xpc3RlbmVyXCIhIEJlZm9yZVxuICAvLyBhZGRpbmcgaXQgdG8gdGhlIGxpc3RlbmVycywgZmlyc3QgZW1pdCBcIm5ld0xpc3RlbmVyXCIuXG4gIGlmICh0aGlzLl9ldmVudHMubmV3TGlzdGVuZXIpXG4gICAgdGhpcy5lbWl0KCduZXdMaXN0ZW5lcicsIHR5cGUsXG4gICAgICAgICAgICAgIGlzRnVuY3Rpb24obGlzdGVuZXIubGlzdGVuZXIpID9cbiAgICAgICAgICAgICAgbGlzdGVuZXIubGlzdGVuZXIgOiBsaXN0ZW5lcik7XG5cbiAgaWYgKCF0aGlzLl9ldmVudHNbdHlwZV0pXG4gICAgLy8gT3B0aW1pemUgdGhlIGNhc2Ugb2Ygb25lIGxpc3RlbmVyLiBEb24ndCBuZWVkIHRoZSBleHRyYSBhcnJheSBvYmplY3QuXG4gICAgdGhpcy5fZXZlbnRzW3R5cGVdID0gbGlzdGVuZXI7XG4gIGVsc2UgaWYgKGlzT2JqZWN0KHRoaXMuX2V2ZW50c1t0eXBlXSkpXG4gICAgLy8gSWYgd2UndmUgYWxyZWFkeSBnb3QgYW4gYXJyYXksIGp1c3QgYXBwZW5kLlxuICAgIHRoaXMuX2V2ZW50c1t0eXBlXS5wdXNoKGxpc3RlbmVyKTtcbiAgZWxzZVxuICAgIC8vIEFkZGluZyB0aGUgc2Vjb25kIGVsZW1lbnQsIG5lZWQgdG8gY2hhbmdlIHRvIGFycmF5LlxuICAgIHRoaXMuX2V2ZW50c1t0eXBlXSA9IFt0aGlzLl9ldmVudHNbdHlwZV0sIGxpc3RlbmVyXTtcblxuICAvLyBDaGVjayBmb3IgbGlzdGVuZXIgbGVha1xuICBpZiAoaXNPYmplY3QodGhpcy5fZXZlbnRzW3R5cGVdKSAmJiAhdGhpcy5fZXZlbnRzW3R5cGVdLndhcm5lZCkge1xuICAgIHZhciBtO1xuICAgIGlmICghaXNVbmRlZmluZWQodGhpcy5fbWF4TGlzdGVuZXJzKSkge1xuICAgICAgbSA9IHRoaXMuX21heExpc3RlbmVycztcbiAgICB9IGVsc2Uge1xuICAgICAgbSA9IEV2ZW50RW1pdHRlci5kZWZhdWx0TWF4TGlzdGVuZXJzO1xuICAgIH1cblxuICAgIGlmIChtICYmIG0gPiAwICYmIHRoaXMuX2V2ZW50c1t0eXBlXS5sZW5ndGggPiBtKSB7XG4gICAgICB0aGlzLl9ldmVudHNbdHlwZV0ud2FybmVkID0gdHJ1ZTtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJyhub2RlKSB3YXJuaW5nOiBwb3NzaWJsZSBFdmVudEVtaXR0ZXIgbWVtb3J5ICcgK1xuICAgICAgICAgICAgICAgICAgICAnbGVhayBkZXRlY3RlZC4gJWQgbGlzdGVuZXJzIGFkZGVkLiAnICtcbiAgICAgICAgICAgICAgICAgICAgJ1VzZSBlbWl0dGVyLnNldE1heExpc3RlbmVycygpIHRvIGluY3JlYXNlIGxpbWl0LicsXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX2V2ZW50c1t0eXBlXS5sZW5ndGgpO1xuICAgICAgaWYgKHR5cGVvZiBjb25zb2xlLnRyYWNlID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIC8vIG5vdCBzdXBwb3J0ZWQgaW4gSUUgMTBcbiAgICAgICAgY29uc29sZS50cmFjZSgpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiB0aGlzO1xufTtcblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5vbiA9IEV2ZW50RW1pdHRlci5wcm90b3R5cGUuYWRkTGlzdGVuZXI7XG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUub25jZSA9IGZ1bmN0aW9uKHR5cGUsIGxpc3RlbmVyKSB7XG4gIGlmICghaXNGdW5jdGlvbihsaXN0ZW5lcikpXG4gICAgdGhyb3cgVHlwZUVycm9yKCdsaXN0ZW5lciBtdXN0IGJlIGEgZnVuY3Rpb24nKTtcblxuICB2YXIgZmlyZWQgPSBmYWxzZTtcblxuICBmdW5jdGlvbiBnKCkge1xuICAgIHRoaXMucmVtb3ZlTGlzdGVuZXIodHlwZSwgZyk7XG5cbiAgICBpZiAoIWZpcmVkKSB7XG4gICAgICBmaXJlZCA9IHRydWU7XG4gICAgICBsaXN0ZW5lci5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgIH1cbiAgfVxuXG4gIGcubGlzdGVuZXIgPSBsaXN0ZW5lcjtcbiAgdGhpcy5vbih0eXBlLCBnKTtcblxuICByZXR1cm4gdGhpcztcbn07XG5cbi8vIGVtaXRzIGEgJ3JlbW92ZUxpc3RlbmVyJyBldmVudCBpZmYgdGhlIGxpc3RlbmVyIHdhcyByZW1vdmVkXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLnJlbW92ZUxpc3RlbmVyID0gZnVuY3Rpb24odHlwZSwgbGlzdGVuZXIpIHtcbiAgdmFyIGxpc3QsIHBvc2l0aW9uLCBsZW5ndGgsIGk7XG5cbiAgaWYgKCFpc0Z1bmN0aW9uKGxpc3RlbmVyKSlcbiAgICB0aHJvdyBUeXBlRXJyb3IoJ2xpc3RlbmVyIG11c3QgYmUgYSBmdW5jdGlvbicpO1xuXG4gIGlmICghdGhpcy5fZXZlbnRzIHx8ICF0aGlzLl9ldmVudHNbdHlwZV0pXG4gICAgcmV0dXJuIHRoaXM7XG5cbiAgbGlzdCA9IHRoaXMuX2V2ZW50c1t0eXBlXTtcbiAgbGVuZ3RoID0gbGlzdC5sZW5ndGg7XG4gIHBvc2l0aW9uID0gLTE7XG5cbiAgaWYgKGxpc3QgPT09IGxpc3RlbmVyIHx8XG4gICAgICAoaXNGdW5jdGlvbihsaXN0Lmxpc3RlbmVyKSAmJiBsaXN0Lmxpc3RlbmVyID09PSBsaXN0ZW5lcikpIHtcbiAgICBkZWxldGUgdGhpcy5fZXZlbnRzW3R5cGVdO1xuICAgIGlmICh0aGlzLl9ldmVudHMucmVtb3ZlTGlzdGVuZXIpXG4gICAgICB0aGlzLmVtaXQoJ3JlbW92ZUxpc3RlbmVyJywgdHlwZSwgbGlzdGVuZXIpO1xuXG4gIH0gZWxzZSBpZiAoaXNPYmplY3QobGlzdCkpIHtcbiAgICBmb3IgKGkgPSBsZW5ndGg7IGktLSA+IDA7KSB7XG4gICAgICBpZiAobGlzdFtpXSA9PT0gbGlzdGVuZXIgfHxcbiAgICAgICAgICAobGlzdFtpXS5saXN0ZW5lciAmJiBsaXN0W2ldLmxpc3RlbmVyID09PSBsaXN0ZW5lcikpIHtcbiAgICAgICAgcG9zaXRpb24gPSBpO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAocG9zaXRpb24gPCAwKVxuICAgICAgcmV0dXJuIHRoaXM7XG5cbiAgICBpZiAobGlzdC5sZW5ndGggPT09IDEpIHtcbiAgICAgIGxpc3QubGVuZ3RoID0gMDtcbiAgICAgIGRlbGV0ZSB0aGlzLl9ldmVudHNbdHlwZV07XG4gICAgfSBlbHNlIHtcbiAgICAgIGxpc3Quc3BsaWNlKHBvc2l0aW9uLCAxKTtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5fZXZlbnRzLnJlbW92ZUxpc3RlbmVyKVxuICAgICAgdGhpcy5lbWl0KCdyZW1vdmVMaXN0ZW5lcicsIHR5cGUsIGxpc3RlbmVyKTtcbiAgfVxuXG4gIHJldHVybiB0aGlzO1xufTtcblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5yZW1vdmVBbGxMaXN0ZW5lcnMgPSBmdW5jdGlvbih0eXBlKSB7XG4gIHZhciBrZXksIGxpc3RlbmVycztcblxuICBpZiAoIXRoaXMuX2V2ZW50cylcbiAgICByZXR1cm4gdGhpcztcblxuICAvLyBub3QgbGlzdGVuaW5nIGZvciByZW1vdmVMaXN0ZW5lciwgbm8gbmVlZCB0byBlbWl0XG4gIGlmICghdGhpcy5fZXZlbnRzLnJlbW92ZUxpc3RlbmVyKSB7XG4gICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDApXG4gICAgICB0aGlzLl9ldmVudHMgPSB7fTtcbiAgICBlbHNlIGlmICh0aGlzLl9ldmVudHNbdHlwZV0pXG4gICAgICBkZWxldGUgdGhpcy5fZXZlbnRzW3R5cGVdO1xuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgLy8gZW1pdCByZW1vdmVMaXN0ZW5lciBmb3IgYWxsIGxpc3RlbmVycyBvbiBhbGwgZXZlbnRzXG4gIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAwKSB7XG4gICAgZm9yIChrZXkgaW4gdGhpcy5fZXZlbnRzKSB7XG4gICAgICBpZiAoa2V5ID09PSAncmVtb3ZlTGlzdGVuZXInKSBjb250aW51ZTtcbiAgICAgIHRoaXMucmVtb3ZlQWxsTGlzdGVuZXJzKGtleSk7XG4gICAgfVxuICAgIHRoaXMucmVtb3ZlQWxsTGlzdGVuZXJzKCdyZW1vdmVMaXN0ZW5lcicpO1xuICAgIHRoaXMuX2V2ZW50cyA9IHt9O1xuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgbGlzdGVuZXJzID0gdGhpcy5fZXZlbnRzW3R5cGVdO1xuXG4gIGlmIChpc0Z1bmN0aW9uKGxpc3RlbmVycykpIHtcbiAgICB0aGlzLnJlbW92ZUxpc3RlbmVyKHR5cGUsIGxpc3RlbmVycyk7XG4gIH0gZWxzZSB7XG4gICAgLy8gTElGTyBvcmRlclxuICAgIHdoaWxlIChsaXN0ZW5lcnMubGVuZ3RoKVxuICAgICAgdGhpcy5yZW1vdmVMaXN0ZW5lcih0eXBlLCBsaXN0ZW5lcnNbbGlzdGVuZXJzLmxlbmd0aCAtIDFdKTtcbiAgfVxuICBkZWxldGUgdGhpcy5fZXZlbnRzW3R5cGVdO1xuXG4gIHJldHVybiB0aGlzO1xufTtcblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5saXN0ZW5lcnMgPSBmdW5jdGlvbih0eXBlKSB7XG4gIHZhciByZXQ7XG4gIGlmICghdGhpcy5fZXZlbnRzIHx8ICF0aGlzLl9ldmVudHNbdHlwZV0pXG4gICAgcmV0ID0gW107XG4gIGVsc2UgaWYgKGlzRnVuY3Rpb24odGhpcy5fZXZlbnRzW3R5cGVdKSlcbiAgICByZXQgPSBbdGhpcy5fZXZlbnRzW3R5cGVdXTtcbiAgZWxzZVxuICAgIHJldCA9IHRoaXMuX2V2ZW50c1t0eXBlXS5zbGljZSgpO1xuICByZXR1cm4gcmV0O1xufTtcblxuRXZlbnRFbWl0dGVyLmxpc3RlbmVyQ291bnQgPSBmdW5jdGlvbihlbWl0dGVyLCB0eXBlKSB7XG4gIHZhciByZXQ7XG4gIGlmICghZW1pdHRlci5fZXZlbnRzIHx8ICFlbWl0dGVyLl9ldmVudHNbdHlwZV0pXG4gICAgcmV0ID0gMDtcbiAgZWxzZSBpZiAoaXNGdW5jdGlvbihlbWl0dGVyLl9ldmVudHNbdHlwZV0pKVxuICAgIHJldCA9IDE7XG4gIGVsc2VcbiAgICByZXQgPSBlbWl0dGVyLl9ldmVudHNbdHlwZV0ubGVuZ3RoO1xuICByZXR1cm4gcmV0O1xufTtcblxuZnVuY3Rpb24gaXNGdW5jdGlvbihhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdmdW5jdGlvbic7XG59XG5cbmZ1bmN0aW9uIGlzTnVtYmVyKGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ251bWJlcic7XG59XG5cbmZ1bmN0aW9uIGlzT2JqZWN0KGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ29iamVjdCcgJiYgYXJnICE9PSBudWxsO1xufVxuXG5mdW5jdGlvbiBpc1VuZGVmaW5lZChhcmcpIHtcbiAgcmV0dXJuIGFyZyA9PT0gdm9pZCAwO1xufVxuIiwibW9kdWxlLmV4cG9ydHMgPSBBcnJheS5pc0FycmF5IHx8IGZ1bmN0aW9uIChhcnIpIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChhcnIpID09ICdbb2JqZWN0IEFycmF5XSc7XG59O1xuIiwiLy8gQ29weXJpZ2h0IEpveWVudCwgSW5jLiBhbmQgb3RoZXIgTm9kZSBjb250cmlidXRvcnMuXG4vL1xuLy8gUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGFcbi8vIGNvcHkgb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGVcbi8vIFwiU29mdHdhcmVcIiksIHRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZ1xuLy8gd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLFxuLy8gZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdFxuLy8gcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlXG4vLyBmb2xsb3dpbmcgY29uZGl0aW9uczpcbi8vXG4vLyBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZFxuLy8gaW4gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4vL1xuLy8gVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTU1xuLy8gT1IgSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRlxuLy8gTUVSQ0hBTlRBQklMSVRZLCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTlxuLy8gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sXG4vLyBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1Jcbi8vIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEVcbi8vIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXG5cbi8vIHJlc29sdmVzIC4gYW5kIC4uIGVsZW1lbnRzIGluIGEgcGF0aCBhcnJheSB3aXRoIGRpcmVjdG9yeSBuYW1lcyB0aGVyZVxuLy8gbXVzdCBiZSBubyBzbGFzaGVzLCBlbXB0eSBlbGVtZW50cywgb3IgZGV2aWNlIG5hbWVzIChjOlxcKSBpbiB0aGUgYXJyYXlcbi8vIChzbyBhbHNvIG5vIGxlYWRpbmcgYW5kIHRyYWlsaW5nIHNsYXNoZXMgLSBpdCBkb2VzIG5vdCBkaXN0aW5ndWlzaFxuLy8gcmVsYXRpdmUgYW5kIGFic29sdXRlIHBhdGhzKVxuZnVuY3Rpb24gbm9ybWFsaXplQXJyYXkocGFydHMsIGFsbG93QWJvdmVSb290KSB7XG4gIC8vIGlmIHRoZSBwYXRoIHRyaWVzIHRvIGdvIGFib3ZlIHRoZSByb290LCBgdXBgIGVuZHMgdXAgPiAwXG4gIHZhciB1cCA9IDA7XG4gIGZvciAodmFyIGkgPSBwYXJ0cy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgIHZhciBsYXN0ID0gcGFydHNbaV07XG4gICAgaWYgKGxhc3QgPT09ICcuJykge1xuICAgICAgcGFydHMuc3BsaWNlKGksIDEpO1xuICAgIH0gZWxzZSBpZiAobGFzdCA9PT0gJy4uJykge1xuICAgICAgcGFydHMuc3BsaWNlKGksIDEpO1xuICAgICAgdXArKztcbiAgICB9IGVsc2UgaWYgKHVwKSB7XG4gICAgICBwYXJ0cy5zcGxpY2UoaSwgMSk7XG4gICAgICB1cC0tO1xuICAgIH1cbiAgfVxuXG4gIC8vIGlmIHRoZSBwYXRoIGlzIGFsbG93ZWQgdG8gZ28gYWJvdmUgdGhlIHJvb3QsIHJlc3RvcmUgbGVhZGluZyAuLnNcbiAgaWYgKGFsbG93QWJvdmVSb290KSB7XG4gICAgZm9yICg7IHVwLS07IHVwKSB7XG4gICAgICBwYXJ0cy51bnNoaWZ0KCcuLicpO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBwYXJ0cztcbn1cblxuLy8gU3BsaXQgYSBmaWxlbmFtZSBpbnRvIFtyb290LCBkaXIsIGJhc2VuYW1lLCBleHRdLCB1bml4IHZlcnNpb25cbi8vICdyb290JyBpcyBqdXN0IGEgc2xhc2gsIG9yIG5vdGhpbmcuXG52YXIgc3BsaXRQYXRoUmUgPVxuICAgIC9eKFxcLz98KShbXFxzXFxTXSo/KSgoPzpcXC57MSwyfXxbXlxcL10rP3wpKFxcLlteLlxcL10qfCkpKD86W1xcL10qKSQvO1xudmFyIHNwbGl0UGF0aCA9IGZ1bmN0aW9uKGZpbGVuYW1lKSB7XG4gIHJldHVybiBzcGxpdFBhdGhSZS5leGVjKGZpbGVuYW1lKS5zbGljZSgxKTtcbn07XG5cbi8vIHBhdGgucmVzb2x2ZShbZnJvbSAuLi5dLCB0bylcbi8vIHBvc2l4IHZlcnNpb25cbmV4cG9ydHMucmVzb2x2ZSA9IGZ1bmN0aW9uKCkge1xuICB2YXIgcmVzb2x2ZWRQYXRoID0gJycsXG4gICAgICByZXNvbHZlZEFic29sdXRlID0gZmFsc2U7XG5cbiAgZm9yICh2YXIgaSA9IGFyZ3VtZW50cy5sZW5ndGggLSAxOyBpID49IC0xICYmICFyZXNvbHZlZEFic29sdXRlOyBpLS0pIHtcbiAgICB2YXIgcGF0aCA9IChpID49IDApID8gYXJndW1lbnRzW2ldIDogcHJvY2Vzcy5jd2QoKTtcblxuICAgIC8vIFNraXAgZW1wdHkgYW5kIGludmFsaWQgZW50cmllc1xuICAgIGlmICh0eXBlb2YgcGF0aCAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0FyZ3VtZW50cyB0byBwYXRoLnJlc29sdmUgbXVzdCBiZSBzdHJpbmdzJyk7XG4gICAgfSBlbHNlIGlmICghcGF0aCkge1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgcmVzb2x2ZWRQYXRoID0gcGF0aCArICcvJyArIHJlc29sdmVkUGF0aDtcbiAgICByZXNvbHZlZEFic29sdXRlID0gcGF0aC5jaGFyQXQoMCkgPT09ICcvJztcbiAgfVxuXG4gIC8vIEF0IHRoaXMgcG9pbnQgdGhlIHBhdGggc2hvdWxkIGJlIHJlc29sdmVkIHRvIGEgZnVsbCBhYnNvbHV0ZSBwYXRoLCBidXRcbiAgLy8gaGFuZGxlIHJlbGF0aXZlIHBhdGhzIHRvIGJlIHNhZmUgKG1pZ2h0IGhhcHBlbiB3aGVuIHByb2Nlc3MuY3dkKCkgZmFpbHMpXG5cbiAgLy8gTm9ybWFsaXplIHRoZSBwYXRoXG4gIHJlc29sdmVkUGF0aCA9IG5vcm1hbGl6ZUFycmF5KGZpbHRlcihyZXNvbHZlZFBhdGguc3BsaXQoJy8nKSwgZnVuY3Rpb24ocCkge1xuICAgIHJldHVybiAhIXA7XG4gIH0pLCAhcmVzb2x2ZWRBYnNvbHV0ZSkuam9pbignLycpO1xuXG4gIHJldHVybiAoKHJlc29sdmVkQWJzb2x1dGUgPyAnLycgOiAnJykgKyByZXNvbHZlZFBhdGgpIHx8ICcuJztcbn07XG5cbi8vIHBhdGgubm9ybWFsaXplKHBhdGgpXG4vLyBwb3NpeCB2ZXJzaW9uXG5leHBvcnRzLm5vcm1hbGl6ZSA9IGZ1bmN0aW9uKHBhdGgpIHtcbiAgdmFyIGlzQWJzb2x1dGUgPSBleHBvcnRzLmlzQWJzb2x1dGUocGF0aCksXG4gICAgICB0cmFpbGluZ1NsYXNoID0gc3Vic3RyKHBhdGgsIC0xKSA9PT0gJy8nO1xuXG4gIC8vIE5vcm1hbGl6ZSB0aGUgcGF0aFxuICBwYXRoID0gbm9ybWFsaXplQXJyYXkoZmlsdGVyKHBhdGguc3BsaXQoJy8nKSwgZnVuY3Rpb24ocCkge1xuICAgIHJldHVybiAhIXA7XG4gIH0pLCAhaXNBYnNvbHV0ZSkuam9pbignLycpO1xuXG4gIGlmICghcGF0aCAmJiAhaXNBYnNvbHV0ZSkge1xuICAgIHBhdGggPSAnLic7XG4gIH1cbiAgaWYgKHBhdGggJiYgdHJhaWxpbmdTbGFzaCkge1xuICAgIHBhdGggKz0gJy8nO1xuICB9XG5cbiAgcmV0dXJuIChpc0Fic29sdXRlID8gJy8nIDogJycpICsgcGF0aDtcbn07XG5cbi8vIHBvc2l4IHZlcnNpb25cbmV4cG9ydHMuaXNBYnNvbHV0ZSA9IGZ1bmN0aW9uKHBhdGgpIHtcbiAgcmV0dXJuIHBhdGguY2hhckF0KDApID09PSAnLyc7XG59O1xuXG4vLyBwb3NpeCB2ZXJzaW9uXG5leHBvcnRzLmpvaW4gPSBmdW5jdGlvbigpIHtcbiAgdmFyIHBhdGhzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAwKTtcbiAgcmV0dXJuIGV4cG9ydHMubm9ybWFsaXplKGZpbHRlcihwYXRocywgZnVuY3Rpb24ocCwgaW5kZXgpIHtcbiAgICBpZiAodHlwZW9mIHAgIT09ICdzdHJpbmcnKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdBcmd1bWVudHMgdG8gcGF0aC5qb2luIG11c3QgYmUgc3RyaW5ncycpO1xuICAgIH1cbiAgICByZXR1cm4gcDtcbiAgfSkuam9pbignLycpKTtcbn07XG5cblxuLy8gcGF0aC5yZWxhdGl2ZShmcm9tLCB0bylcbi8vIHBvc2l4IHZlcnNpb25cbmV4cG9ydHMucmVsYXRpdmUgPSBmdW5jdGlvbihmcm9tLCB0bykge1xuICBmcm9tID0gZXhwb3J0cy5yZXNvbHZlKGZyb20pLnN1YnN0cigxKTtcbiAgdG8gPSBleHBvcnRzLnJlc29sdmUodG8pLnN1YnN0cigxKTtcblxuICBmdW5jdGlvbiB0cmltKGFycikge1xuICAgIHZhciBzdGFydCA9IDA7XG4gICAgZm9yICg7IHN0YXJ0IDwgYXJyLmxlbmd0aDsgc3RhcnQrKykge1xuICAgICAgaWYgKGFycltzdGFydF0gIT09ICcnKSBicmVhaztcbiAgICB9XG5cbiAgICB2YXIgZW5kID0gYXJyLmxlbmd0aCAtIDE7XG4gICAgZm9yICg7IGVuZCA+PSAwOyBlbmQtLSkge1xuICAgICAgaWYgKGFycltlbmRdICE9PSAnJykgYnJlYWs7XG4gICAgfVxuXG4gICAgaWYgKHN0YXJ0ID4gZW5kKSByZXR1cm4gW107XG4gICAgcmV0dXJuIGFyci5zbGljZShzdGFydCwgZW5kIC0gc3RhcnQgKyAxKTtcbiAgfVxuXG4gIHZhciBmcm9tUGFydHMgPSB0cmltKGZyb20uc3BsaXQoJy8nKSk7XG4gIHZhciB0b1BhcnRzID0gdHJpbSh0by5zcGxpdCgnLycpKTtcblxuICB2YXIgbGVuZ3RoID0gTWF0aC5taW4oZnJvbVBhcnRzLmxlbmd0aCwgdG9QYXJ0cy5sZW5ndGgpO1xuICB2YXIgc2FtZVBhcnRzTGVuZ3RoID0gbGVuZ3RoO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgaWYgKGZyb21QYXJ0c1tpXSAhPT0gdG9QYXJ0c1tpXSkge1xuICAgICAgc2FtZVBhcnRzTGVuZ3RoID0gaTtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuXG4gIHZhciBvdXRwdXRQYXJ0cyA9IFtdO1xuICBmb3IgKHZhciBpID0gc2FtZVBhcnRzTGVuZ3RoOyBpIDwgZnJvbVBhcnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgb3V0cHV0UGFydHMucHVzaCgnLi4nKTtcbiAgfVxuXG4gIG91dHB1dFBhcnRzID0gb3V0cHV0UGFydHMuY29uY2F0KHRvUGFydHMuc2xpY2Uoc2FtZVBhcnRzTGVuZ3RoKSk7XG5cbiAgcmV0dXJuIG91dHB1dFBhcnRzLmpvaW4oJy8nKTtcbn07XG5cbmV4cG9ydHMuc2VwID0gJy8nO1xuZXhwb3J0cy5kZWxpbWl0ZXIgPSAnOic7XG5cbmV4cG9ydHMuZGlybmFtZSA9IGZ1bmN0aW9uKHBhdGgpIHtcbiAgdmFyIHJlc3VsdCA9IHNwbGl0UGF0aChwYXRoKSxcbiAgICAgIHJvb3QgPSByZXN1bHRbMF0sXG4gICAgICBkaXIgPSByZXN1bHRbMV07XG5cbiAgaWYgKCFyb290ICYmICFkaXIpIHtcbiAgICAvLyBObyBkaXJuYW1lIHdoYXRzb2V2ZXJcbiAgICByZXR1cm4gJy4nO1xuICB9XG5cbiAgaWYgKGRpcikge1xuICAgIC8vIEl0IGhhcyBhIGRpcm5hbWUsIHN0cmlwIHRyYWlsaW5nIHNsYXNoXG4gICAgZGlyID0gZGlyLnN1YnN0cigwLCBkaXIubGVuZ3RoIC0gMSk7XG4gIH1cblxuICByZXR1cm4gcm9vdCArIGRpcjtcbn07XG5cblxuZXhwb3J0cy5iYXNlbmFtZSA9IGZ1bmN0aW9uKHBhdGgsIGV4dCkge1xuICB2YXIgZiA9IHNwbGl0UGF0aChwYXRoKVsyXTtcbiAgLy8gVE9ETzogbWFrZSB0aGlzIGNvbXBhcmlzb24gY2FzZS1pbnNlbnNpdGl2ZSBvbiB3aW5kb3dzP1xuICBpZiAoZXh0ICYmIGYuc3Vic3RyKC0xICogZXh0Lmxlbmd0aCkgPT09IGV4dCkge1xuICAgIGYgPSBmLnN1YnN0cigwLCBmLmxlbmd0aCAtIGV4dC5sZW5ndGgpO1xuICB9XG4gIHJldHVybiBmO1xufTtcblxuXG5leHBvcnRzLmV4dG5hbWUgPSBmdW5jdGlvbihwYXRoKSB7XG4gIHJldHVybiBzcGxpdFBhdGgocGF0aClbM107XG59O1xuXG5mdW5jdGlvbiBmaWx0ZXIgKHhzLCBmKSB7XG4gICAgaWYgKHhzLmZpbHRlcikgcmV0dXJuIHhzLmZpbHRlcihmKTtcbiAgICB2YXIgcmVzID0gW107XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB4cy5sZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAoZih4c1tpXSwgaSwgeHMpKSByZXMucHVzaCh4c1tpXSk7XG4gICAgfVxuICAgIHJldHVybiByZXM7XG59XG5cbi8vIFN0cmluZy5wcm90b3R5cGUuc3Vic3RyIC0gbmVnYXRpdmUgaW5kZXggZG9uJ3Qgd29yayBpbiBJRThcbnZhciBzdWJzdHIgPSAnYWInLnN1YnN0cigtMSkgPT09ICdiJ1xuICAgID8gZnVuY3Rpb24gKHN0ciwgc3RhcnQsIGxlbikgeyByZXR1cm4gc3RyLnN1YnN0cihzdGFydCwgbGVuKSB9XG4gICAgOiBmdW5jdGlvbiAoc3RyLCBzdGFydCwgbGVuKSB7XG4gICAgICAgIGlmIChzdGFydCA8IDApIHN0YXJ0ID0gc3RyLmxlbmd0aCArIHN0YXJ0O1xuICAgICAgICByZXR1cm4gc3RyLnN1YnN0cihzdGFydCwgbGVuKTtcbiAgICB9XG47XG4iLCIvLyBzaGltIGZvciB1c2luZyBwcm9jZXNzIGluIGJyb3dzZXJcblxudmFyIHByb2Nlc3MgPSBtb2R1bGUuZXhwb3J0cyA9IHt9O1xudmFyIHF1ZXVlID0gW107XG52YXIgZHJhaW5pbmcgPSBmYWxzZTtcblxuZnVuY3Rpb24gZHJhaW5RdWV1ZSgpIHtcbiAgICBpZiAoZHJhaW5pbmcpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBkcmFpbmluZyA9IHRydWU7XG4gICAgdmFyIGN1cnJlbnRRdWV1ZTtcbiAgICB2YXIgbGVuID0gcXVldWUubGVuZ3RoO1xuICAgIHdoaWxlKGxlbikge1xuICAgICAgICBjdXJyZW50UXVldWUgPSBxdWV1ZTtcbiAgICAgICAgcXVldWUgPSBbXTtcbiAgICAgICAgdmFyIGkgPSAtMTtcbiAgICAgICAgd2hpbGUgKCsraSA8IGxlbikge1xuICAgICAgICAgICAgY3VycmVudFF1ZXVlW2ldKCk7XG4gICAgICAgIH1cbiAgICAgICAgbGVuID0gcXVldWUubGVuZ3RoO1xuICAgIH1cbiAgICBkcmFpbmluZyA9IGZhbHNlO1xufVxucHJvY2Vzcy5uZXh0VGljayA9IGZ1bmN0aW9uIChmdW4pIHtcbiAgICBxdWV1ZS5wdXNoKGZ1bik7XG4gICAgaWYgKCFkcmFpbmluZykge1xuICAgICAgICBzZXRUaW1lb3V0KGRyYWluUXVldWUsIDApO1xuICAgIH1cbn07XG5cbnByb2Nlc3MudGl0bGUgPSAnYnJvd3Nlcic7XG5wcm9jZXNzLmJyb3dzZXIgPSB0cnVlO1xucHJvY2Vzcy5lbnYgPSB7fTtcbnByb2Nlc3MuYXJndiA9IFtdO1xucHJvY2Vzcy52ZXJzaW9uID0gJyc7IC8vIGVtcHR5IHN0cmluZyB0byBhdm9pZCByZWdleHAgaXNzdWVzXG5wcm9jZXNzLnZlcnNpb25zID0ge307XG5cbmZ1bmN0aW9uIG5vb3AoKSB7fVxuXG5wcm9jZXNzLm9uID0gbm9vcDtcbnByb2Nlc3MuYWRkTGlzdGVuZXIgPSBub29wO1xucHJvY2Vzcy5vbmNlID0gbm9vcDtcbnByb2Nlc3Mub2ZmID0gbm9vcDtcbnByb2Nlc3MucmVtb3ZlTGlzdGVuZXIgPSBub29wO1xucHJvY2Vzcy5yZW1vdmVBbGxMaXN0ZW5lcnMgPSBub29wO1xucHJvY2Vzcy5lbWl0ID0gbm9vcDtcblxucHJvY2Vzcy5iaW5kaW5nID0gZnVuY3Rpb24gKG5hbWUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Byb2Nlc3MuYmluZGluZyBpcyBub3Qgc3VwcG9ydGVkJyk7XG59O1xuXG4vLyBUT0RPKHNodHlsbWFuKVxucHJvY2Vzcy5jd2QgPSBmdW5jdGlvbiAoKSB7IHJldHVybiAnLycgfTtcbnByb2Nlc3MuY2hkaXIgPSBmdW5jdGlvbiAoZGlyKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmNoZGlyIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn07XG5wcm9jZXNzLnVtYXNrID0gZnVuY3Rpb24oKSB7IHJldHVybiAwOyB9O1xuIiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKFwiLi9saWIvX3N0cmVhbV9kdXBsZXguanNcIilcbiIsIi8vIENvcHlyaWdodCBKb3llbnQsIEluYy4gYW5kIG90aGVyIE5vZGUgY29udHJpYnV0b3JzLlxuLy9cbi8vIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhXG4vLyBjb3B5IG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlXG4vLyBcIlNvZnR3YXJlXCIpLCB0byBkZWFsIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmdcbi8vIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCxcbi8vIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXRcbi8vIHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXMgZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZVxuLy8gZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4vL1xuLy8gVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWRcbi8vIGluIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuLy9cbi8vIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1Ncbi8vIE9SIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0Zcbi8vIE1FUkNIQU5UQUJJTElUWSwgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU5cbi8vIE5PIEVWRU5UIFNIQUxMIFRIRSBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLFxuLy8gREFNQUdFUyBPUiBPVEhFUiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SXG4vLyBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSwgT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFXG4vLyBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFIFNPRlRXQVJFLlxuXG4vLyBhIGR1cGxleCBzdHJlYW0gaXMganVzdCBhIHN0cmVhbSB0aGF0IGlzIGJvdGggcmVhZGFibGUgYW5kIHdyaXRhYmxlLlxuLy8gU2luY2UgSlMgZG9lc24ndCBoYXZlIG11bHRpcGxlIHByb3RvdHlwYWwgaW5oZXJpdGFuY2UsIHRoaXMgY2xhc3Ncbi8vIHByb3RvdHlwYWxseSBpbmhlcml0cyBmcm9tIFJlYWRhYmxlLCBhbmQgdGhlbiBwYXJhc2l0aWNhbGx5IGZyb21cbi8vIFdyaXRhYmxlLlxuXG5tb2R1bGUuZXhwb3J0cyA9IER1cGxleDtcblxuLyo8cmVwbGFjZW1lbnQ+Ki9cbnZhciBvYmplY3RLZXlzID0gT2JqZWN0LmtleXMgfHwgZnVuY3Rpb24gKG9iaikge1xuICB2YXIga2V5cyA9IFtdO1xuICBmb3IgKHZhciBrZXkgaW4gb2JqKSBrZXlzLnB1c2goa2V5KTtcbiAgcmV0dXJuIGtleXM7XG59XG4vKjwvcmVwbGFjZW1lbnQ+Ki9cblxuXG4vKjxyZXBsYWNlbWVudD4qL1xudmFyIHV0aWwgPSByZXF1aXJlKCdjb3JlLXV0aWwtaXMnKTtcbnV0aWwuaW5oZXJpdHMgPSByZXF1aXJlKCdpbmhlcml0cycpO1xuLyo8L3JlcGxhY2VtZW50PiovXG5cbnZhciBSZWFkYWJsZSA9IHJlcXVpcmUoJy4vX3N0cmVhbV9yZWFkYWJsZScpO1xudmFyIFdyaXRhYmxlID0gcmVxdWlyZSgnLi9fc3RyZWFtX3dyaXRhYmxlJyk7XG5cbnV0aWwuaW5oZXJpdHMoRHVwbGV4LCBSZWFkYWJsZSk7XG5cbmZvckVhY2gob2JqZWN0S2V5cyhXcml0YWJsZS5wcm90b3R5cGUpLCBmdW5jdGlvbihtZXRob2QpIHtcbiAgaWYgKCFEdXBsZXgucHJvdG90eXBlW21ldGhvZF0pXG4gICAgRHVwbGV4LnByb3RvdHlwZVttZXRob2RdID0gV3JpdGFibGUucHJvdG90eXBlW21ldGhvZF07XG59KTtcblxuZnVuY3Rpb24gRHVwbGV4KG9wdGlvbnMpIHtcbiAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIER1cGxleCkpXG4gICAgcmV0dXJuIG5ldyBEdXBsZXgob3B0aW9ucyk7XG5cbiAgUmVhZGFibGUuY2FsbCh0aGlzLCBvcHRpb25zKTtcbiAgV3JpdGFibGUuY2FsbCh0aGlzLCBvcHRpb25zKTtcblxuICBpZiAob3B0aW9ucyAmJiBvcHRpb25zLnJlYWRhYmxlID09PSBmYWxzZSlcbiAgICB0aGlzLnJlYWRhYmxlID0gZmFsc2U7XG5cbiAgaWYgKG9wdGlvbnMgJiYgb3B0aW9ucy53cml0YWJsZSA9PT0gZmFsc2UpXG4gICAgdGhpcy53cml0YWJsZSA9IGZhbHNlO1xuXG4gIHRoaXMuYWxsb3dIYWxmT3BlbiA9IHRydWU7XG4gIGlmIChvcHRpb25zICYmIG9wdGlvbnMuYWxsb3dIYWxmT3BlbiA9PT0gZmFsc2UpXG4gICAgdGhpcy5hbGxvd0hhbGZPcGVuID0gZmFsc2U7XG5cbiAgdGhpcy5vbmNlKCdlbmQnLCBvbmVuZCk7XG59XG5cbi8vIHRoZSBuby1oYWxmLW9wZW4gZW5mb3JjZXJcbmZ1bmN0aW9uIG9uZW5kKCkge1xuICAvLyBpZiB3ZSBhbGxvdyBoYWxmLW9wZW4gc3RhdGUsIG9yIGlmIHRoZSB3cml0YWJsZSBzaWRlIGVuZGVkLFxuICAvLyB0aGVuIHdlJ3JlIG9rLlxuICBpZiAodGhpcy5hbGxvd0hhbGZPcGVuIHx8IHRoaXMuX3dyaXRhYmxlU3RhdGUuZW5kZWQpXG4gICAgcmV0dXJuO1xuXG4gIC8vIG5vIG1vcmUgZGF0YSBjYW4gYmUgd3JpdHRlbi5cbiAgLy8gQnV0IGFsbG93IG1vcmUgd3JpdGVzIHRvIGhhcHBlbiBpbiB0aGlzIHRpY2suXG4gIHByb2Nlc3MubmV4dFRpY2sodGhpcy5lbmQuYmluZCh0aGlzKSk7XG59XG5cbmZ1bmN0aW9uIGZvckVhY2ggKHhzLCBmKSB7XG4gIGZvciAodmFyIGkgPSAwLCBsID0geHMubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgZih4c1tpXSwgaSk7XG4gIH1cbn1cbiIsIi8vIENvcHlyaWdodCBKb3llbnQsIEluYy4gYW5kIG90aGVyIE5vZGUgY29udHJpYnV0b3JzLlxuLy9cbi8vIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhXG4vLyBjb3B5IG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlXG4vLyBcIlNvZnR3YXJlXCIpLCB0byBkZWFsIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmdcbi8vIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCxcbi8vIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXRcbi8vIHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXMgZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZVxuLy8gZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4vL1xuLy8gVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWRcbi8vIGluIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuLy9cbi8vIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1Ncbi8vIE9SIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0Zcbi8vIE1FUkNIQU5UQUJJTElUWSwgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU5cbi8vIE5PIEVWRU5UIFNIQUxMIFRIRSBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLFxuLy8gREFNQUdFUyBPUiBPVEhFUiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SXG4vLyBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSwgT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFXG4vLyBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFIFNPRlRXQVJFLlxuXG4vLyBhIHBhc3N0aHJvdWdoIHN0cmVhbS5cbi8vIGJhc2ljYWxseSBqdXN0IHRoZSBtb3N0IG1pbmltYWwgc29ydCBvZiBUcmFuc2Zvcm0gc3RyZWFtLlxuLy8gRXZlcnkgd3JpdHRlbiBjaHVuayBnZXRzIG91dHB1dCBhcy1pcy5cblxubW9kdWxlLmV4cG9ydHMgPSBQYXNzVGhyb3VnaDtcblxudmFyIFRyYW5zZm9ybSA9IHJlcXVpcmUoJy4vX3N0cmVhbV90cmFuc2Zvcm0nKTtcblxuLyo8cmVwbGFjZW1lbnQ+Ki9cbnZhciB1dGlsID0gcmVxdWlyZSgnY29yZS11dGlsLWlzJyk7XG51dGlsLmluaGVyaXRzID0gcmVxdWlyZSgnaW5oZXJpdHMnKTtcbi8qPC9yZXBsYWNlbWVudD4qL1xuXG51dGlsLmluaGVyaXRzKFBhc3NUaHJvdWdoLCBUcmFuc2Zvcm0pO1xuXG5mdW5jdGlvbiBQYXNzVGhyb3VnaChvcHRpb25zKSB7XG4gIGlmICghKHRoaXMgaW5zdGFuY2VvZiBQYXNzVGhyb3VnaCkpXG4gICAgcmV0dXJuIG5ldyBQYXNzVGhyb3VnaChvcHRpb25zKTtcblxuICBUcmFuc2Zvcm0uY2FsbCh0aGlzLCBvcHRpb25zKTtcbn1cblxuUGFzc1Rocm91Z2gucHJvdG90eXBlLl90cmFuc2Zvcm0gPSBmdW5jdGlvbihjaHVuaywgZW5jb2RpbmcsIGNiKSB7XG4gIGNiKG51bGwsIGNodW5rKTtcbn07XG4iLCIvLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxubW9kdWxlLmV4cG9ydHMgPSBSZWFkYWJsZTtcblxuLyo8cmVwbGFjZW1lbnQ+Ki9cbnZhciBpc0FycmF5ID0gcmVxdWlyZSgnaXNhcnJheScpO1xuLyo8L3JlcGxhY2VtZW50PiovXG5cblxuLyo8cmVwbGFjZW1lbnQ+Ki9cbnZhciBCdWZmZXIgPSByZXF1aXJlKCdidWZmZXInKS5CdWZmZXI7XG4vKjwvcmVwbGFjZW1lbnQ+Ki9cblxuUmVhZGFibGUuUmVhZGFibGVTdGF0ZSA9IFJlYWRhYmxlU3RhdGU7XG5cbnZhciBFRSA9IHJlcXVpcmUoJ2V2ZW50cycpLkV2ZW50RW1pdHRlcjtcblxuLyo8cmVwbGFjZW1lbnQ+Ki9cbmlmICghRUUubGlzdGVuZXJDb3VudCkgRUUubGlzdGVuZXJDb3VudCA9IGZ1bmN0aW9uKGVtaXR0ZXIsIHR5cGUpIHtcbiAgcmV0dXJuIGVtaXR0ZXIubGlzdGVuZXJzKHR5cGUpLmxlbmd0aDtcbn07XG4vKjwvcmVwbGFjZW1lbnQ+Ki9cblxudmFyIFN0cmVhbSA9IHJlcXVpcmUoJ3N0cmVhbScpO1xuXG4vKjxyZXBsYWNlbWVudD4qL1xudmFyIHV0aWwgPSByZXF1aXJlKCdjb3JlLXV0aWwtaXMnKTtcbnV0aWwuaW5oZXJpdHMgPSByZXF1aXJlKCdpbmhlcml0cycpO1xuLyo8L3JlcGxhY2VtZW50PiovXG5cbnZhciBTdHJpbmdEZWNvZGVyO1xuXG5cbi8qPHJlcGxhY2VtZW50PiovXG52YXIgZGVidWcgPSByZXF1aXJlKCd1dGlsJyk7XG5pZiAoZGVidWcgJiYgZGVidWcuZGVidWdsb2cpIHtcbiAgZGVidWcgPSBkZWJ1Zy5kZWJ1Z2xvZygnc3RyZWFtJyk7XG59IGVsc2Uge1xuICBkZWJ1ZyA9IGZ1bmN0aW9uICgpIHt9O1xufVxuLyo8L3JlcGxhY2VtZW50PiovXG5cblxudXRpbC5pbmhlcml0cyhSZWFkYWJsZSwgU3RyZWFtKTtcblxuZnVuY3Rpb24gUmVhZGFibGVTdGF0ZShvcHRpb25zLCBzdHJlYW0pIHtcbiAgdmFyIER1cGxleCA9IHJlcXVpcmUoJy4vX3N0cmVhbV9kdXBsZXgnKTtcblxuICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcblxuICAvLyB0aGUgcG9pbnQgYXQgd2hpY2ggaXQgc3RvcHMgY2FsbGluZyBfcmVhZCgpIHRvIGZpbGwgdGhlIGJ1ZmZlclxuICAvLyBOb3RlOiAwIGlzIGEgdmFsaWQgdmFsdWUsIG1lYW5zIFwiZG9uJ3QgY2FsbCBfcmVhZCBwcmVlbXB0aXZlbHkgZXZlclwiXG4gIHZhciBod20gPSBvcHRpb25zLmhpZ2hXYXRlck1hcms7XG4gIHZhciBkZWZhdWx0SHdtID0gb3B0aW9ucy5vYmplY3RNb2RlID8gMTYgOiAxNiAqIDEwMjQ7XG4gIHRoaXMuaGlnaFdhdGVyTWFyayA9IChod20gfHwgaHdtID09PSAwKSA/IGh3bSA6IGRlZmF1bHRId207XG5cbiAgLy8gY2FzdCB0byBpbnRzLlxuICB0aGlzLmhpZ2hXYXRlck1hcmsgPSB+fnRoaXMuaGlnaFdhdGVyTWFyaztcblxuICB0aGlzLmJ1ZmZlciA9IFtdO1xuICB0aGlzLmxlbmd0aCA9IDA7XG4gIHRoaXMucGlwZXMgPSBudWxsO1xuICB0aGlzLnBpcGVzQ291bnQgPSAwO1xuICB0aGlzLmZsb3dpbmcgPSBudWxsO1xuICB0aGlzLmVuZGVkID0gZmFsc2U7XG4gIHRoaXMuZW5kRW1pdHRlZCA9IGZhbHNlO1xuICB0aGlzLnJlYWRpbmcgPSBmYWxzZTtcblxuICAvLyBhIGZsYWcgdG8gYmUgYWJsZSB0byB0ZWxsIGlmIHRoZSBvbndyaXRlIGNiIGlzIGNhbGxlZCBpbW1lZGlhdGVseSxcbiAgLy8gb3Igb24gYSBsYXRlciB0aWNrLiAgV2Ugc2V0IHRoaXMgdG8gdHJ1ZSBhdCBmaXJzdCwgYmVjYXVzZSBhbnlcbiAgLy8gYWN0aW9ucyB0aGF0IHNob3VsZG4ndCBoYXBwZW4gdW50aWwgXCJsYXRlclwiIHNob3VsZCBnZW5lcmFsbHkgYWxzb1xuICAvLyBub3QgaGFwcGVuIGJlZm9yZSB0aGUgZmlyc3Qgd3JpdGUgY2FsbC5cbiAgdGhpcy5zeW5jID0gdHJ1ZTtcblxuICAvLyB3aGVuZXZlciB3ZSByZXR1cm4gbnVsbCwgdGhlbiB3ZSBzZXQgYSBmbGFnIHRvIHNheVxuICAvLyB0aGF0IHdlJ3JlIGF3YWl0aW5nIGEgJ3JlYWRhYmxlJyBldmVudCBlbWlzc2lvbi5cbiAgdGhpcy5uZWVkUmVhZGFibGUgPSBmYWxzZTtcbiAgdGhpcy5lbWl0dGVkUmVhZGFibGUgPSBmYWxzZTtcbiAgdGhpcy5yZWFkYWJsZUxpc3RlbmluZyA9IGZhbHNlO1xuXG5cbiAgLy8gb2JqZWN0IHN0cmVhbSBmbGFnLiBVc2VkIHRvIG1ha2UgcmVhZChuKSBpZ25vcmUgbiBhbmQgdG9cbiAgLy8gbWFrZSBhbGwgdGhlIGJ1ZmZlciBtZXJnaW5nIGFuZCBsZW5ndGggY2hlY2tzIGdvIGF3YXlcbiAgdGhpcy5vYmplY3RNb2RlID0gISFvcHRpb25zLm9iamVjdE1vZGU7XG5cbiAgaWYgKHN0cmVhbSBpbnN0YW5jZW9mIER1cGxleClcbiAgICB0aGlzLm9iamVjdE1vZGUgPSB0aGlzLm9iamVjdE1vZGUgfHwgISFvcHRpb25zLnJlYWRhYmxlT2JqZWN0TW9kZTtcblxuICAvLyBDcnlwdG8gaXMga2luZCBvZiBvbGQgYW5kIGNydXN0eS4gIEhpc3RvcmljYWxseSwgaXRzIGRlZmF1bHQgc3RyaW5nXG4gIC8vIGVuY29kaW5nIGlzICdiaW5hcnknIHNvIHdlIGhhdmUgdG8gbWFrZSB0aGlzIGNvbmZpZ3VyYWJsZS5cbiAgLy8gRXZlcnl0aGluZyBlbHNlIGluIHRoZSB1bml2ZXJzZSB1c2VzICd1dGY4JywgdGhvdWdoLlxuICB0aGlzLmRlZmF1bHRFbmNvZGluZyA9IG9wdGlvbnMuZGVmYXVsdEVuY29kaW5nIHx8ICd1dGY4JztcblxuICAvLyB3aGVuIHBpcGluZywgd2Ugb25seSBjYXJlIGFib3V0ICdyZWFkYWJsZScgZXZlbnRzIHRoYXQgaGFwcGVuXG4gIC8vIGFmdGVyIHJlYWQoKWluZyBhbGwgdGhlIGJ5dGVzIGFuZCBub3QgZ2V0dGluZyBhbnkgcHVzaGJhY2suXG4gIHRoaXMucmFuT3V0ID0gZmFsc2U7XG5cbiAgLy8gdGhlIG51bWJlciBvZiB3cml0ZXJzIHRoYXQgYXJlIGF3YWl0aW5nIGEgZHJhaW4gZXZlbnQgaW4gLnBpcGUoKXNcbiAgdGhpcy5hd2FpdERyYWluID0gMDtcblxuICAvLyBpZiB0cnVlLCBhIG1heWJlUmVhZE1vcmUgaGFzIGJlZW4gc2NoZWR1bGVkXG4gIHRoaXMucmVhZGluZ01vcmUgPSBmYWxzZTtcblxuICB0aGlzLmRlY29kZXIgPSBudWxsO1xuICB0aGlzLmVuY29kaW5nID0gbnVsbDtcbiAgaWYgKG9wdGlvbnMuZW5jb2RpbmcpIHtcbiAgICBpZiAoIVN0cmluZ0RlY29kZXIpXG4gICAgICBTdHJpbmdEZWNvZGVyID0gcmVxdWlyZSgnc3RyaW5nX2RlY29kZXIvJykuU3RyaW5nRGVjb2RlcjtcbiAgICB0aGlzLmRlY29kZXIgPSBuZXcgU3RyaW5nRGVjb2RlcihvcHRpb25zLmVuY29kaW5nKTtcbiAgICB0aGlzLmVuY29kaW5nID0gb3B0aW9ucy5lbmNvZGluZztcbiAgfVxufVxuXG5mdW5jdGlvbiBSZWFkYWJsZShvcHRpb25zKSB7XG4gIHZhciBEdXBsZXggPSByZXF1aXJlKCcuL19zdHJlYW1fZHVwbGV4Jyk7XG5cbiAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIFJlYWRhYmxlKSlcbiAgICByZXR1cm4gbmV3IFJlYWRhYmxlKG9wdGlvbnMpO1xuXG4gIHRoaXMuX3JlYWRhYmxlU3RhdGUgPSBuZXcgUmVhZGFibGVTdGF0ZShvcHRpb25zLCB0aGlzKTtcblxuICAvLyBsZWdhY3lcbiAgdGhpcy5yZWFkYWJsZSA9IHRydWU7XG5cbiAgU3RyZWFtLmNhbGwodGhpcyk7XG59XG5cbi8vIE1hbnVhbGx5IHNob3ZlIHNvbWV0aGluZyBpbnRvIHRoZSByZWFkKCkgYnVmZmVyLlxuLy8gVGhpcyByZXR1cm5zIHRydWUgaWYgdGhlIGhpZ2hXYXRlck1hcmsgaGFzIG5vdCBiZWVuIGhpdCB5ZXQsXG4vLyBzaW1pbGFyIHRvIGhvdyBXcml0YWJsZS53cml0ZSgpIHJldHVybnMgdHJ1ZSBpZiB5b3Ugc2hvdWxkXG4vLyB3cml0ZSgpIHNvbWUgbW9yZS5cblJlYWRhYmxlLnByb3RvdHlwZS5wdXNoID0gZnVuY3Rpb24oY2h1bmssIGVuY29kaW5nKSB7XG4gIHZhciBzdGF0ZSA9IHRoaXMuX3JlYWRhYmxlU3RhdGU7XG5cbiAgaWYgKHV0aWwuaXNTdHJpbmcoY2h1bmspICYmICFzdGF0ZS5vYmplY3RNb2RlKSB7XG4gICAgZW5jb2RpbmcgPSBlbmNvZGluZyB8fCBzdGF0ZS5kZWZhdWx0RW5jb2Rpbmc7XG4gICAgaWYgKGVuY29kaW5nICE9PSBzdGF0ZS5lbmNvZGluZykge1xuICAgICAgY2h1bmsgPSBuZXcgQnVmZmVyKGNodW5rLCBlbmNvZGluZyk7XG4gICAgICBlbmNvZGluZyA9ICcnO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiByZWFkYWJsZUFkZENodW5rKHRoaXMsIHN0YXRlLCBjaHVuaywgZW5jb2RpbmcsIGZhbHNlKTtcbn07XG5cbi8vIFVuc2hpZnQgc2hvdWxkICphbHdheXMqIGJlIHNvbWV0aGluZyBkaXJlY3RseSBvdXQgb2YgcmVhZCgpXG5SZWFkYWJsZS5wcm90b3R5cGUudW5zaGlmdCA9IGZ1bmN0aW9uKGNodW5rKSB7XG4gIHZhciBzdGF0ZSA9IHRoaXMuX3JlYWRhYmxlU3RhdGU7XG4gIHJldHVybiByZWFkYWJsZUFkZENodW5rKHRoaXMsIHN0YXRlLCBjaHVuaywgJycsIHRydWUpO1xufTtcblxuZnVuY3Rpb24gcmVhZGFibGVBZGRDaHVuayhzdHJlYW0sIHN0YXRlLCBjaHVuaywgZW5jb2RpbmcsIGFkZFRvRnJvbnQpIHtcbiAgdmFyIGVyID0gY2h1bmtJbnZhbGlkKHN0YXRlLCBjaHVuayk7XG4gIGlmIChlcikge1xuICAgIHN0cmVhbS5lbWl0KCdlcnJvcicsIGVyKTtcbiAgfSBlbHNlIGlmICh1dGlsLmlzTnVsbE9yVW5kZWZpbmVkKGNodW5rKSkge1xuICAgIHN0YXRlLnJlYWRpbmcgPSBmYWxzZTtcbiAgICBpZiAoIXN0YXRlLmVuZGVkKVxuICAgICAgb25Fb2ZDaHVuayhzdHJlYW0sIHN0YXRlKTtcbiAgfSBlbHNlIGlmIChzdGF0ZS5vYmplY3RNb2RlIHx8IGNodW5rICYmIGNodW5rLmxlbmd0aCA+IDApIHtcbiAgICBpZiAoc3RhdGUuZW5kZWQgJiYgIWFkZFRvRnJvbnQpIHtcbiAgICAgIHZhciBlID0gbmV3IEVycm9yKCdzdHJlYW0ucHVzaCgpIGFmdGVyIEVPRicpO1xuICAgICAgc3RyZWFtLmVtaXQoJ2Vycm9yJywgZSk7XG4gICAgfSBlbHNlIGlmIChzdGF0ZS5lbmRFbWl0dGVkICYmIGFkZFRvRnJvbnQpIHtcbiAgICAgIHZhciBlID0gbmV3IEVycm9yKCdzdHJlYW0udW5zaGlmdCgpIGFmdGVyIGVuZCBldmVudCcpO1xuICAgICAgc3RyZWFtLmVtaXQoJ2Vycm9yJywgZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGlmIChzdGF0ZS5kZWNvZGVyICYmICFhZGRUb0Zyb250ICYmICFlbmNvZGluZylcbiAgICAgICAgY2h1bmsgPSBzdGF0ZS5kZWNvZGVyLndyaXRlKGNodW5rKTtcblxuICAgICAgaWYgKCFhZGRUb0Zyb250KVxuICAgICAgICBzdGF0ZS5yZWFkaW5nID0gZmFsc2U7XG5cbiAgICAgIC8vIGlmIHdlIHdhbnQgdGhlIGRhdGEgbm93LCBqdXN0IGVtaXQgaXQuXG4gICAgICBpZiAoc3RhdGUuZmxvd2luZyAmJiBzdGF0ZS5sZW5ndGggPT09IDAgJiYgIXN0YXRlLnN5bmMpIHtcbiAgICAgICAgc3RyZWFtLmVtaXQoJ2RhdGEnLCBjaHVuayk7XG4gICAgICAgIHN0cmVhbS5yZWFkKDApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gdXBkYXRlIHRoZSBidWZmZXIgaW5mby5cbiAgICAgICAgc3RhdGUubGVuZ3RoICs9IHN0YXRlLm9iamVjdE1vZGUgPyAxIDogY2h1bmsubGVuZ3RoO1xuICAgICAgICBpZiAoYWRkVG9Gcm9udClcbiAgICAgICAgICBzdGF0ZS5idWZmZXIudW5zaGlmdChjaHVuayk7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICBzdGF0ZS5idWZmZXIucHVzaChjaHVuayk7XG5cbiAgICAgICAgaWYgKHN0YXRlLm5lZWRSZWFkYWJsZSlcbiAgICAgICAgICBlbWl0UmVhZGFibGUoc3RyZWFtKTtcbiAgICAgIH1cblxuICAgICAgbWF5YmVSZWFkTW9yZShzdHJlYW0sIHN0YXRlKTtcbiAgICB9XG4gIH0gZWxzZSBpZiAoIWFkZFRvRnJvbnQpIHtcbiAgICBzdGF0ZS5yZWFkaW5nID0gZmFsc2U7XG4gIH1cblxuICByZXR1cm4gbmVlZE1vcmVEYXRhKHN0YXRlKTtcbn1cblxuXG5cbi8vIGlmIGl0J3MgcGFzdCB0aGUgaGlnaCB3YXRlciBtYXJrLCB3ZSBjYW4gcHVzaCBpbiBzb21lIG1vcmUuXG4vLyBBbHNvLCBpZiB3ZSBoYXZlIG5vIGRhdGEgeWV0LCB3ZSBjYW4gc3RhbmQgc29tZVxuLy8gbW9yZSBieXRlcy4gIFRoaXMgaXMgdG8gd29yayBhcm91bmQgY2FzZXMgd2hlcmUgaHdtPTAsXG4vLyBzdWNoIGFzIHRoZSByZXBsLiAgQWxzbywgaWYgdGhlIHB1c2goKSB0cmlnZ2VyZWQgYVxuLy8gcmVhZGFibGUgZXZlbnQsIGFuZCB0aGUgdXNlciBjYWxsZWQgcmVhZChsYXJnZU51bWJlcikgc3VjaCB0aGF0XG4vLyBuZWVkUmVhZGFibGUgd2FzIHNldCwgdGhlbiB3ZSBvdWdodCB0byBwdXNoIG1vcmUsIHNvIHRoYXQgYW5vdGhlclxuLy8gJ3JlYWRhYmxlJyBldmVudCB3aWxsIGJlIHRyaWdnZXJlZC5cbmZ1bmN0aW9uIG5lZWRNb3JlRGF0YShzdGF0ZSkge1xuICByZXR1cm4gIXN0YXRlLmVuZGVkICYmXG4gICAgICAgICAoc3RhdGUubmVlZFJlYWRhYmxlIHx8XG4gICAgICAgICAgc3RhdGUubGVuZ3RoIDwgc3RhdGUuaGlnaFdhdGVyTWFyayB8fFxuICAgICAgICAgIHN0YXRlLmxlbmd0aCA9PT0gMCk7XG59XG5cbi8vIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5LlxuUmVhZGFibGUucHJvdG90eXBlLnNldEVuY29kaW5nID0gZnVuY3Rpb24oZW5jKSB7XG4gIGlmICghU3RyaW5nRGVjb2RlcilcbiAgICBTdHJpbmdEZWNvZGVyID0gcmVxdWlyZSgnc3RyaW5nX2RlY29kZXIvJykuU3RyaW5nRGVjb2RlcjtcbiAgdGhpcy5fcmVhZGFibGVTdGF0ZS5kZWNvZGVyID0gbmV3IFN0cmluZ0RlY29kZXIoZW5jKTtcbiAgdGhpcy5fcmVhZGFibGVTdGF0ZS5lbmNvZGluZyA9IGVuYztcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vLyBEb24ndCByYWlzZSB0aGUgaHdtID4gMTI4TUJcbnZhciBNQVhfSFdNID0gMHg4MDAwMDA7XG5mdW5jdGlvbiByb3VuZFVwVG9OZXh0UG93ZXJPZjIobikge1xuICBpZiAobiA+PSBNQVhfSFdNKSB7XG4gICAgbiA9IE1BWF9IV007XG4gIH0gZWxzZSB7XG4gICAgLy8gR2V0IHRoZSBuZXh0IGhpZ2hlc3QgcG93ZXIgb2YgMlxuICAgIG4tLTtcbiAgICBmb3IgKHZhciBwID0gMTsgcCA8IDMyOyBwIDw8PSAxKSBuIHw9IG4gPj4gcDtcbiAgICBuKys7XG4gIH1cbiAgcmV0dXJuIG47XG59XG5cbmZ1bmN0aW9uIGhvd011Y2hUb1JlYWQobiwgc3RhdGUpIHtcbiAgaWYgKHN0YXRlLmxlbmd0aCA9PT0gMCAmJiBzdGF0ZS5lbmRlZClcbiAgICByZXR1cm4gMDtcblxuICBpZiAoc3RhdGUub2JqZWN0TW9kZSlcbiAgICByZXR1cm4gbiA9PT0gMCA/IDAgOiAxO1xuXG4gIGlmIChpc05hTihuKSB8fCB1dGlsLmlzTnVsbChuKSkge1xuICAgIC8vIG9ubHkgZmxvdyBvbmUgYnVmZmVyIGF0IGEgdGltZVxuICAgIGlmIChzdGF0ZS5mbG93aW5nICYmIHN0YXRlLmJ1ZmZlci5sZW5ndGgpXG4gICAgICByZXR1cm4gc3RhdGUuYnVmZmVyWzBdLmxlbmd0aDtcbiAgICBlbHNlXG4gICAgICByZXR1cm4gc3RhdGUubGVuZ3RoO1xuICB9XG5cbiAgaWYgKG4gPD0gMClcbiAgICByZXR1cm4gMDtcblxuICAvLyBJZiB3ZSdyZSBhc2tpbmcgZm9yIG1vcmUgdGhhbiB0aGUgdGFyZ2V0IGJ1ZmZlciBsZXZlbCxcbiAgLy8gdGhlbiByYWlzZSB0aGUgd2F0ZXIgbWFyay4gIEJ1bXAgdXAgdG8gdGhlIG5leHQgaGlnaGVzdFxuICAvLyBwb3dlciBvZiAyLCB0byBwcmV2ZW50IGluY3JlYXNpbmcgaXQgZXhjZXNzaXZlbHkgaW4gdGlueVxuICAvLyBhbW91bnRzLlxuICBpZiAobiA+IHN0YXRlLmhpZ2hXYXRlck1hcmspXG4gICAgc3RhdGUuaGlnaFdhdGVyTWFyayA9IHJvdW5kVXBUb05leHRQb3dlck9mMihuKTtcblxuICAvLyBkb24ndCBoYXZlIHRoYXQgbXVjaC4gIHJldHVybiBudWxsLCB1bmxlc3Mgd2UndmUgZW5kZWQuXG4gIGlmIChuID4gc3RhdGUubGVuZ3RoKSB7XG4gICAgaWYgKCFzdGF0ZS5lbmRlZCkge1xuICAgICAgc3RhdGUubmVlZFJlYWRhYmxlID0gdHJ1ZTtcbiAgICAgIHJldHVybiAwO1xuICAgIH0gZWxzZVxuICAgICAgcmV0dXJuIHN0YXRlLmxlbmd0aDtcbiAgfVxuXG4gIHJldHVybiBuO1xufVxuXG4vLyB5b3UgY2FuIG92ZXJyaWRlIGVpdGhlciB0aGlzIG1ldGhvZCwgb3IgdGhlIGFzeW5jIF9yZWFkKG4pIGJlbG93LlxuUmVhZGFibGUucHJvdG90eXBlLnJlYWQgPSBmdW5jdGlvbihuKSB7XG4gIGRlYnVnKCdyZWFkJywgbik7XG4gIHZhciBzdGF0ZSA9IHRoaXMuX3JlYWRhYmxlU3RhdGU7XG4gIHZhciBuT3JpZyA9IG47XG5cbiAgaWYgKCF1dGlsLmlzTnVtYmVyKG4pIHx8IG4gPiAwKVxuICAgIHN0YXRlLmVtaXR0ZWRSZWFkYWJsZSA9IGZhbHNlO1xuXG4gIC8vIGlmIHdlJ3JlIGRvaW5nIHJlYWQoMCkgdG8gdHJpZ2dlciBhIHJlYWRhYmxlIGV2ZW50LCBidXQgd2VcbiAgLy8gYWxyZWFkeSBoYXZlIGEgYnVuY2ggb2YgZGF0YSBpbiB0aGUgYnVmZmVyLCB0aGVuIGp1c3QgdHJpZ2dlclxuICAvLyB0aGUgJ3JlYWRhYmxlJyBldmVudCBhbmQgbW92ZSBvbi5cbiAgaWYgKG4gPT09IDAgJiZcbiAgICAgIHN0YXRlLm5lZWRSZWFkYWJsZSAmJlxuICAgICAgKHN0YXRlLmxlbmd0aCA+PSBzdGF0ZS5oaWdoV2F0ZXJNYXJrIHx8IHN0YXRlLmVuZGVkKSkge1xuICAgIGRlYnVnKCdyZWFkOiBlbWl0UmVhZGFibGUnLCBzdGF0ZS5sZW5ndGgsIHN0YXRlLmVuZGVkKTtcbiAgICBpZiAoc3RhdGUubGVuZ3RoID09PSAwICYmIHN0YXRlLmVuZGVkKVxuICAgICAgZW5kUmVhZGFibGUodGhpcyk7XG4gICAgZWxzZVxuICAgICAgZW1pdFJlYWRhYmxlKHRoaXMpO1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgbiA9IGhvd011Y2hUb1JlYWQobiwgc3RhdGUpO1xuXG4gIC8vIGlmIHdlJ3ZlIGVuZGVkLCBhbmQgd2UncmUgbm93IGNsZWFyLCB0aGVuIGZpbmlzaCBpdCB1cC5cbiAgaWYgKG4gPT09IDAgJiYgc3RhdGUuZW5kZWQpIHtcbiAgICBpZiAoc3RhdGUubGVuZ3RoID09PSAwKVxuICAgICAgZW5kUmVhZGFibGUodGhpcyk7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICAvLyBBbGwgdGhlIGFjdHVhbCBjaHVuayBnZW5lcmF0aW9uIGxvZ2ljIG5lZWRzIHRvIGJlXG4gIC8vICpiZWxvdyogdGhlIGNhbGwgdG8gX3JlYWQuICBUaGUgcmVhc29uIGlzIHRoYXQgaW4gY2VydGFpblxuICAvLyBzeW50aGV0aWMgc3RyZWFtIGNhc2VzLCBzdWNoIGFzIHBhc3N0aHJvdWdoIHN0cmVhbXMsIF9yZWFkXG4gIC8vIG1heSBiZSBhIGNvbXBsZXRlbHkgc3luY2hyb25vdXMgb3BlcmF0aW9uIHdoaWNoIG1heSBjaGFuZ2VcbiAgLy8gdGhlIHN0YXRlIG9mIHRoZSByZWFkIGJ1ZmZlciwgcHJvdmlkaW5nIGVub3VnaCBkYXRhIHdoZW5cbiAgLy8gYmVmb3JlIHRoZXJlIHdhcyAqbm90KiBlbm91Z2guXG4gIC8vXG4gIC8vIFNvLCB0aGUgc3RlcHMgYXJlOlxuICAvLyAxLiBGaWd1cmUgb3V0IHdoYXQgdGhlIHN0YXRlIG9mIHRoaW5ncyB3aWxsIGJlIGFmdGVyIHdlIGRvXG4gIC8vIGEgcmVhZCBmcm9tIHRoZSBidWZmZXIuXG4gIC8vXG4gIC8vIDIuIElmIHRoYXQgcmVzdWx0aW5nIHN0YXRlIHdpbGwgdHJpZ2dlciBhIF9yZWFkLCB0aGVuIGNhbGwgX3JlYWQuXG4gIC8vIE5vdGUgdGhhdCB0aGlzIG1heSBiZSBhc3luY2hyb25vdXMsIG9yIHN5bmNocm9ub3VzLiAgWWVzLCBpdCBpc1xuICAvLyBkZWVwbHkgdWdseSB0byB3cml0ZSBBUElzIHRoaXMgd2F5LCBidXQgdGhhdCBzdGlsbCBkb2Vzbid0IG1lYW5cbiAgLy8gdGhhdCB0aGUgUmVhZGFibGUgY2xhc3Mgc2hvdWxkIGJlaGF2ZSBpbXByb3Blcmx5LCBhcyBzdHJlYW1zIGFyZVxuICAvLyBkZXNpZ25lZCB0byBiZSBzeW5jL2FzeW5jIGFnbm9zdGljLlxuICAvLyBUYWtlIG5vdGUgaWYgdGhlIF9yZWFkIGNhbGwgaXMgc3luYyBvciBhc3luYyAoaWUsIGlmIHRoZSByZWFkIGNhbGxcbiAgLy8gaGFzIHJldHVybmVkIHlldCksIHNvIHRoYXQgd2Uga25vdyB3aGV0aGVyIG9yIG5vdCBpdCdzIHNhZmUgdG8gZW1pdFxuICAvLyAncmVhZGFibGUnIGV0Yy5cbiAgLy9cbiAgLy8gMy4gQWN0dWFsbHkgcHVsbCB0aGUgcmVxdWVzdGVkIGNodW5rcyBvdXQgb2YgdGhlIGJ1ZmZlciBhbmQgcmV0dXJuLlxuXG4gIC8vIGlmIHdlIG5lZWQgYSByZWFkYWJsZSBldmVudCwgdGhlbiB3ZSBuZWVkIHRvIGRvIHNvbWUgcmVhZGluZy5cbiAgdmFyIGRvUmVhZCA9IHN0YXRlLm5lZWRSZWFkYWJsZTtcbiAgZGVidWcoJ25lZWQgcmVhZGFibGUnLCBkb1JlYWQpO1xuXG4gIC8vIGlmIHdlIGN1cnJlbnRseSBoYXZlIGxlc3MgdGhhbiB0aGUgaGlnaFdhdGVyTWFyaywgdGhlbiBhbHNvIHJlYWQgc29tZVxuICBpZiAoc3RhdGUubGVuZ3RoID09PSAwIHx8IHN0YXRlLmxlbmd0aCAtIG4gPCBzdGF0ZS5oaWdoV2F0ZXJNYXJrKSB7XG4gICAgZG9SZWFkID0gdHJ1ZTtcbiAgICBkZWJ1ZygnbGVuZ3RoIGxlc3MgdGhhbiB3YXRlcm1hcmsnLCBkb1JlYWQpO1xuICB9XG5cbiAgLy8gaG93ZXZlciwgaWYgd2UndmUgZW5kZWQsIHRoZW4gdGhlcmUncyBubyBwb2ludCwgYW5kIGlmIHdlJ3JlIGFscmVhZHlcbiAgLy8gcmVhZGluZywgdGhlbiBpdCdzIHVubmVjZXNzYXJ5LlxuICBpZiAoc3RhdGUuZW5kZWQgfHwgc3RhdGUucmVhZGluZykge1xuICAgIGRvUmVhZCA9IGZhbHNlO1xuICAgIGRlYnVnKCdyZWFkaW5nIG9yIGVuZGVkJywgZG9SZWFkKTtcbiAgfVxuXG4gIGlmIChkb1JlYWQpIHtcbiAgICBkZWJ1ZygnZG8gcmVhZCcpO1xuICAgIHN0YXRlLnJlYWRpbmcgPSB0cnVlO1xuICAgIHN0YXRlLnN5bmMgPSB0cnVlO1xuICAgIC8vIGlmIHRoZSBsZW5ndGggaXMgY3VycmVudGx5IHplcm8sIHRoZW4gd2UgKm5lZWQqIGEgcmVhZGFibGUgZXZlbnQuXG4gICAgaWYgKHN0YXRlLmxlbmd0aCA9PT0gMClcbiAgICAgIHN0YXRlLm5lZWRSZWFkYWJsZSA9IHRydWU7XG4gICAgLy8gY2FsbCBpbnRlcm5hbCByZWFkIG1ldGhvZFxuICAgIHRoaXMuX3JlYWQoc3RhdGUuaGlnaFdhdGVyTWFyayk7XG4gICAgc3RhdGUuc3luYyA9IGZhbHNlO1xuICB9XG5cbiAgLy8gSWYgX3JlYWQgcHVzaGVkIGRhdGEgc3luY2hyb25vdXNseSwgdGhlbiBgcmVhZGluZ2Agd2lsbCBiZSBmYWxzZSxcbiAgLy8gYW5kIHdlIG5lZWQgdG8gcmUtZXZhbHVhdGUgaG93IG11Y2ggZGF0YSB3ZSBjYW4gcmV0dXJuIHRvIHRoZSB1c2VyLlxuICBpZiAoZG9SZWFkICYmICFzdGF0ZS5yZWFkaW5nKVxuICAgIG4gPSBob3dNdWNoVG9SZWFkKG5PcmlnLCBzdGF0ZSk7XG5cbiAgdmFyIHJldDtcbiAgaWYgKG4gPiAwKVxuICAgIHJldCA9IGZyb21MaXN0KG4sIHN0YXRlKTtcbiAgZWxzZVxuICAgIHJldCA9IG51bGw7XG5cbiAgaWYgKHV0aWwuaXNOdWxsKHJldCkpIHtcbiAgICBzdGF0ZS5uZWVkUmVhZGFibGUgPSB0cnVlO1xuICAgIG4gPSAwO1xuICB9XG5cbiAgc3RhdGUubGVuZ3RoIC09IG47XG5cbiAgLy8gSWYgd2UgaGF2ZSBub3RoaW5nIGluIHRoZSBidWZmZXIsIHRoZW4gd2Ugd2FudCB0byBrbm93XG4gIC8vIGFzIHNvb24gYXMgd2UgKmRvKiBnZXQgc29tZXRoaW5nIGludG8gdGhlIGJ1ZmZlci5cbiAgaWYgKHN0YXRlLmxlbmd0aCA9PT0gMCAmJiAhc3RhdGUuZW5kZWQpXG4gICAgc3RhdGUubmVlZFJlYWRhYmxlID0gdHJ1ZTtcblxuICAvLyBJZiB3ZSB0cmllZCB0byByZWFkKCkgcGFzdCB0aGUgRU9GLCB0aGVuIGVtaXQgZW5kIG9uIHRoZSBuZXh0IHRpY2suXG4gIGlmIChuT3JpZyAhPT0gbiAmJiBzdGF0ZS5lbmRlZCAmJiBzdGF0ZS5sZW5ndGggPT09IDApXG4gICAgZW5kUmVhZGFibGUodGhpcyk7XG5cbiAgaWYgKCF1dGlsLmlzTnVsbChyZXQpKVxuICAgIHRoaXMuZW1pdCgnZGF0YScsIHJldCk7XG5cbiAgcmV0dXJuIHJldDtcbn07XG5cbmZ1bmN0aW9uIGNodW5rSW52YWxpZChzdGF0ZSwgY2h1bmspIHtcbiAgdmFyIGVyID0gbnVsbDtcbiAgaWYgKCF1dGlsLmlzQnVmZmVyKGNodW5rKSAmJlxuICAgICAgIXV0aWwuaXNTdHJpbmcoY2h1bmspICYmXG4gICAgICAhdXRpbC5pc051bGxPclVuZGVmaW5lZChjaHVuaykgJiZcbiAgICAgICFzdGF0ZS5vYmplY3RNb2RlKSB7XG4gICAgZXIgPSBuZXcgVHlwZUVycm9yKCdJbnZhbGlkIG5vbi1zdHJpbmcvYnVmZmVyIGNodW5rJyk7XG4gIH1cbiAgcmV0dXJuIGVyO1xufVxuXG5cbmZ1bmN0aW9uIG9uRW9mQ2h1bmsoc3RyZWFtLCBzdGF0ZSkge1xuICBpZiAoc3RhdGUuZGVjb2RlciAmJiAhc3RhdGUuZW5kZWQpIHtcbiAgICB2YXIgY2h1bmsgPSBzdGF0ZS5kZWNvZGVyLmVuZCgpO1xuICAgIGlmIChjaHVuayAmJiBjaHVuay5sZW5ndGgpIHtcbiAgICAgIHN0YXRlLmJ1ZmZlci5wdXNoKGNodW5rKTtcbiAgICAgIHN0YXRlLmxlbmd0aCArPSBzdGF0ZS5vYmplY3RNb2RlID8gMSA6IGNodW5rLmxlbmd0aDtcbiAgICB9XG4gIH1cbiAgc3RhdGUuZW5kZWQgPSB0cnVlO1xuXG4gIC8vIGVtaXQgJ3JlYWRhYmxlJyBub3cgdG8gbWFrZSBzdXJlIGl0IGdldHMgcGlja2VkIHVwLlxuICBlbWl0UmVhZGFibGUoc3RyZWFtKTtcbn1cblxuLy8gRG9uJ3QgZW1pdCByZWFkYWJsZSByaWdodCBhd2F5IGluIHN5bmMgbW9kZSwgYmVjYXVzZSB0aGlzIGNhbiB0cmlnZ2VyXG4vLyBhbm90aGVyIHJlYWQoKSBjYWxsID0+IHN0YWNrIG92ZXJmbG93LiAgVGhpcyB3YXksIGl0IG1pZ2h0IHRyaWdnZXJcbi8vIGEgbmV4dFRpY2sgcmVjdXJzaW9uIHdhcm5pbmcsIGJ1dCB0aGF0J3Mgbm90IHNvIGJhZC5cbmZ1bmN0aW9uIGVtaXRSZWFkYWJsZShzdHJlYW0pIHtcbiAgdmFyIHN0YXRlID0gc3RyZWFtLl9yZWFkYWJsZVN0YXRlO1xuICBzdGF0ZS5uZWVkUmVhZGFibGUgPSBmYWxzZTtcbiAgaWYgKCFzdGF0ZS5lbWl0dGVkUmVhZGFibGUpIHtcbiAgICBkZWJ1ZygnZW1pdFJlYWRhYmxlJywgc3RhdGUuZmxvd2luZyk7XG4gICAgc3RhdGUuZW1pdHRlZFJlYWRhYmxlID0gdHJ1ZTtcbiAgICBpZiAoc3RhdGUuc3luYylcbiAgICAgIHByb2Nlc3MubmV4dFRpY2soZnVuY3Rpb24oKSB7XG4gICAgICAgIGVtaXRSZWFkYWJsZV8oc3RyZWFtKTtcbiAgICAgIH0pO1xuICAgIGVsc2VcbiAgICAgIGVtaXRSZWFkYWJsZV8oc3RyZWFtKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBlbWl0UmVhZGFibGVfKHN0cmVhbSkge1xuICBkZWJ1ZygnZW1pdCByZWFkYWJsZScpO1xuICBzdHJlYW0uZW1pdCgncmVhZGFibGUnKTtcbiAgZmxvdyhzdHJlYW0pO1xufVxuXG5cbi8vIGF0IHRoaXMgcG9pbnQsIHRoZSB1c2VyIGhhcyBwcmVzdW1hYmx5IHNlZW4gdGhlICdyZWFkYWJsZScgZXZlbnQsXG4vLyBhbmQgY2FsbGVkIHJlYWQoKSB0byBjb25zdW1lIHNvbWUgZGF0YS4gIHRoYXQgbWF5IGhhdmUgdHJpZ2dlcmVkXG4vLyBpbiB0dXJuIGFub3RoZXIgX3JlYWQobikgY2FsbCwgaW4gd2hpY2ggY2FzZSByZWFkaW5nID0gdHJ1ZSBpZlxuLy8gaXQncyBpbiBwcm9ncmVzcy5cbi8vIEhvd2V2ZXIsIGlmIHdlJ3JlIG5vdCBlbmRlZCwgb3IgcmVhZGluZywgYW5kIHRoZSBsZW5ndGggPCBod20sXG4vLyB0aGVuIGdvIGFoZWFkIGFuZCB0cnkgdG8gcmVhZCBzb21lIG1vcmUgcHJlZW1wdGl2ZWx5LlxuZnVuY3Rpb24gbWF5YmVSZWFkTW9yZShzdHJlYW0sIHN0YXRlKSB7XG4gIGlmICghc3RhdGUucmVhZGluZ01vcmUpIHtcbiAgICBzdGF0ZS5yZWFkaW5nTW9yZSA9IHRydWU7XG4gICAgcHJvY2Vzcy5uZXh0VGljayhmdW5jdGlvbigpIHtcbiAgICAgIG1heWJlUmVhZE1vcmVfKHN0cmVhbSwgc3RhdGUpO1xuICAgIH0pO1xuICB9XG59XG5cbmZ1bmN0aW9uIG1heWJlUmVhZE1vcmVfKHN0cmVhbSwgc3RhdGUpIHtcbiAgdmFyIGxlbiA9IHN0YXRlLmxlbmd0aDtcbiAgd2hpbGUgKCFzdGF0ZS5yZWFkaW5nICYmICFzdGF0ZS5mbG93aW5nICYmICFzdGF0ZS5lbmRlZCAmJlxuICAgICAgICAgc3RhdGUubGVuZ3RoIDwgc3RhdGUuaGlnaFdhdGVyTWFyaykge1xuICAgIGRlYnVnKCdtYXliZVJlYWRNb3JlIHJlYWQgMCcpO1xuICAgIHN0cmVhbS5yZWFkKDApO1xuICAgIGlmIChsZW4gPT09IHN0YXRlLmxlbmd0aClcbiAgICAgIC8vIGRpZG4ndCBnZXQgYW55IGRhdGEsIHN0b3Agc3Bpbm5pbmcuXG4gICAgICBicmVhaztcbiAgICBlbHNlXG4gICAgICBsZW4gPSBzdGF0ZS5sZW5ndGg7XG4gIH1cbiAgc3RhdGUucmVhZGluZ01vcmUgPSBmYWxzZTtcbn1cblxuLy8gYWJzdHJhY3QgbWV0aG9kLiAgdG8gYmUgb3ZlcnJpZGRlbiBpbiBzcGVjaWZpYyBpbXBsZW1lbnRhdGlvbiBjbGFzc2VzLlxuLy8gY2FsbCBjYihlciwgZGF0YSkgd2hlcmUgZGF0YSBpcyA8PSBuIGluIGxlbmd0aC5cbi8vIGZvciB2aXJ0dWFsIChub24tc3RyaW5nLCBub24tYnVmZmVyKSBzdHJlYW1zLCBcImxlbmd0aFwiIGlzIHNvbWV3aGF0XG4vLyBhcmJpdHJhcnksIGFuZCBwZXJoYXBzIG5vdCB2ZXJ5IG1lYW5pbmdmdWwuXG5SZWFkYWJsZS5wcm90b3R5cGUuX3JlYWQgPSBmdW5jdGlvbihuKSB7XG4gIHRoaXMuZW1pdCgnZXJyb3InLCBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpKTtcbn07XG5cblJlYWRhYmxlLnByb3RvdHlwZS5waXBlID0gZnVuY3Rpb24oZGVzdCwgcGlwZU9wdHMpIHtcbiAgdmFyIHNyYyA9IHRoaXM7XG4gIHZhciBzdGF0ZSA9IHRoaXMuX3JlYWRhYmxlU3RhdGU7XG5cbiAgc3dpdGNoIChzdGF0ZS5waXBlc0NvdW50KSB7XG4gICAgY2FzZSAwOlxuICAgICAgc3RhdGUucGlwZXMgPSBkZXN0O1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAxOlxuICAgICAgc3RhdGUucGlwZXMgPSBbc3RhdGUucGlwZXMsIGRlc3RdO1xuICAgICAgYnJlYWs7XG4gICAgZGVmYXVsdDpcbiAgICAgIHN0YXRlLnBpcGVzLnB1c2goZGVzdCk7XG4gICAgICBicmVhaztcbiAgfVxuICBzdGF0ZS5waXBlc0NvdW50ICs9IDE7XG4gIGRlYnVnKCdwaXBlIGNvdW50PSVkIG9wdHM9JWonLCBzdGF0ZS5waXBlc0NvdW50LCBwaXBlT3B0cyk7XG5cbiAgdmFyIGRvRW5kID0gKCFwaXBlT3B0cyB8fCBwaXBlT3B0cy5lbmQgIT09IGZhbHNlKSAmJlxuICAgICAgICAgICAgICBkZXN0ICE9PSBwcm9jZXNzLnN0ZG91dCAmJlxuICAgICAgICAgICAgICBkZXN0ICE9PSBwcm9jZXNzLnN0ZGVycjtcblxuICB2YXIgZW5kRm4gPSBkb0VuZCA/IG9uZW5kIDogY2xlYW51cDtcbiAgaWYgKHN0YXRlLmVuZEVtaXR0ZWQpXG4gICAgcHJvY2Vzcy5uZXh0VGljayhlbmRGbik7XG4gIGVsc2VcbiAgICBzcmMub25jZSgnZW5kJywgZW5kRm4pO1xuXG4gIGRlc3Qub24oJ3VucGlwZScsIG9udW5waXBlKTtcbiAgZnVuY3Rpb24gb251bnBpcGUocmVhZGFibGUpIHtcbiAgICBkZWJ1Zygnb251bnBpcGUnKTtcbiAgICBpZiAocmVhZGFibGUgPT09IHNyYykge1xuICAgICAgY2xlYW51cCgpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIG9uZW5kKCkge1xuICAgIGRlYnVnKCdvbmVuZCcpO1xuICAgIGRlc3QuZW5kKCk7XG4gIH1cblxuICAvLyB3aGVuIHRoZSBkZXN0IGRyYWlucywgaXQgcmVkdWNlcyB0aGUgYXdhaXREcmFpbiBjb3VudGVyXG4gIC8vIG9uIHRoZSBzb3VyY2UuICBUaGlzIHdvdWxkIGJlIG1vcmUgZWxlZ2FudCB3aXRoIGEgLm9uY2UoKVxuICAvLyBoYW5kbGVyIGluIGZsb3coKSwgYnV0IGFkZGluZyBhbmQgcmVtb3ZpbmcgcmVwZWF0ZWRseSBpc1xuICAvLyB0b28gc2xvdy5cbiAgdmFyIG9uZHJhaW4gPSBwaXBlT25EcmFpbihzcmMpO1xuICBkZXN0Lm9uKCdkcmFpbicsIG9uZHJhaW4pO1xuXG4gIGZ1bmN0aW9uIGNsZWFudXAoKSB7XG4gICAgZGVidWcoJ2NsZWFudXAnKTtcbiAgICAvLyBjbGVhbnVwIGV2ZW50IGhhbmRsZXJzIG9uY2UgdGhlIHBpcGUgaXMgYnJva2VuXG4gICAgZGVzdC5yZW1vdmVMaXN0ZW5lcignY2xvc2UnLCBvbmNsb3NlKTtcbiAgICBkZXN0LnJlbW92ZUxpc3RlbmVyKCdmaW5pc2gnLCBvbmZpbmlzaCk7XG4gICAgZGVzdC5yZW1vdmVMaXN0ZW5lcignZHJhaW4nLCBvbmRyYWluKTtcbiAgICBkZXN0LnJlbW92ZUxpc3RlbmVyKCdlcnJvcicsIG9uZXJyb3IpO1xuICAgIGRlc3QucmVtb3ZlTGlzdGVuZXIoJ3VucGlwZScsIG9udW5waXBlKTtcbiAgICBzcmMucmVtb3ZlTGlzdGVuZXIoJ2VuZCcsIG9uZW5kKTtcbiAgICBzcmMucmVtb3ZlTGlzdGVuZXIoJ2VuZCcsIGNsZWFudXApO1xuICAgIHNyYy5yZW1vdmVMaXN0ZW5lcignZGF0YScsIG9uZGF0YSk7XG5cbiAgICAvLyBpZiB0aGUgcmVhZGVyIGlzIHdhaXRpbmcgZm9yIGEgZHJhaW4gZXZlbnQgZnJvbSB0aGlzXG4gICAgLy8gc3BlY2lmaWMgd3JpdGVyLCB0aGVuIGl0IHdvdWxkIGNhdXNlIGl0IHRvIG5ldmVyIHN0YXJ0XG4gICAgLy8gZmxvd2luZyBhZ2Fpbi5cbiAgICAvLyBTbywgaWYgdGhpcyBpcyBhd2FpdGluZyBhIGRyYWluLCB0aGVuIHdlIGp1c3QgY2FsbCBpdCBub3cuXG4gICAgLy8gSWYgd2UgZG9uJ3Qga25vdywgdGhlbiBhc3N1bWUgdGhhdCB3ZSBhcmUgd2FpdGluZyBmb3Igb25lLlxuICAgIGlmIChzdGF0ZS5hd2FpdERyYWluICYmXG4gICAgICAgICghZGVzdC5fd3JpdGFibGVTdGF0ZSB8fCBkZXN0Ll93cml0YWJsZVN0YXRlLm5lZWREcmFpbikpXG4gICAgICBvbmRyYWluKCk7XG4gIH1cblxuICBzcmMub24oJ2RhdGEnLCBvbmRhdGEpO1xuICBmdW5jdGlvbiBvbmRhdGEoY2h1bmspIHtcbiAgICBkZWJ1Zygnb25kYXRhJyk7XG4gICAgdmFyIHJldCA9IGRlc3Qud3JpdGUoY2h1bmspO1xuICAgIGlmIChmYWxzZSA9PT0gcmV0KSB7XG4gICAgICBkZWJ1ZygnZmFsc2Ugd3JpdGUgcmVzcG9uc2UsIHBhdXNlJyxcbiAgICAgICAgICAgIHNyYy5fcmVhZGFibGVTdGF0ZS5hd2FpdERyYWluKTtcbiAgICAgIHNyYy5fcmVhZGFibGVTdGF0ZS5hd2FpdERyYWluKys7XG4gICAgICBzcmMucGF1c2UoKTtcbiAgICB9XG4gIH1cblxuICAvLyBpZiB0aGUgZGVzdCBoYXMgYW4gZXJyb3IsIHRoZW4gc3RvcCBwaXBpbmcgaW50byBpdC5cbiAgLy8gaG93ZXZlciwgZG9uJ3Qgc3VwcHJlc3MgdGhlIHRocm93aW5nIGJlaGF2aW9yIGZvciB0aGlzLlxuICBmdW5jdGlvbiBvbmVycm9yKGVyKSB7XG4gICAgZGVidWcoJ29uZXJyb3InLCBlcik7XG4gICAgdW5waXBlKCk7XG4gICAgZGVzdC5yZW1vdmVMaXN0ZW5lcignZXJyb3InLCBvbmVycm9yKTtcbiAgICBpZiAoRUUubGlzdGVuZXJDb3VudChkZXN0LCAnZXJyb3InKSA9PT0gMClcbiAgICAgIGRlc3QuZW1pdCgnZXJyb3InLCBlcik7XG4gIH1cbiAgLy8gVGhpcyBpcyBhIGJydXRhbGx5IHVnbHkgaGFjayB0byBtYWtlIHN1cmUgdGhhdCBvdXIgZXJyb3IgaGFuZGxlclxuICAvLyBpcyBhdHRhY2hlZCBiZWZvcmUgYW55IHVzZXJsYW5kIG9uZXMuICBORVZFUiBETyBUSElTLlxuICBpZiAoIWRlc3QuX2V2ZW50cyB8fCAhZGVzdC5fZXZlbnRzLmVycm9yKVxuICAgIGRlc3Qub24oJ2Vycm9yJywgb25lcnJvcik7XG4gIGVsc2UgaWYgKGlzQXJyYXkoZGVzdC5fZXZlbnRzLmVycm9yKSlcbiAgICBkZXN0Ll9ldmVudHMuZXJyb3IudW5zaGlmdChvbmVycm9yKTtcbiAgZWxzZVxuICAgIGRlc3QuX2V2ZW50cy5lcnJvciA9IFtvbmVycm9yLCBkZXN0Ll9ldmVudHMuZXJyb3JdO1xuXG5cblxuICAvLyBCb3RoIGNsb3NlIGFuZCBmaW5pc2ggc2hvdWxkIHRyaWdnZXIgdW5waXBlLCBidXQgb25seSBvbmNlLlxuICBmdW5jdGlvbiBvbmNsb3NlKCkge1xuICAgIGRlc3QucmVtb3ZlTGlzdGVuZXIoJ2ZpbmlzaCcsIG9uZmluaXNoKTtcbiAgICB1bnBpcGUoKTtcbiAgfVxuICBkZXN0Lm9uY2UoJ2Nsb3NlJywgb25jbG9zZSk7XG4gIGZ1bmN0aW9uIG9uZmluaXNoKCkge1xuICAgIGRlYnVnKCdvbmZpbmlzaCcpO1xuICAgIGRlc3QucmVtb3ZlTGlzdGVuZXIoJ2Nsb3NlJywgb25jbG9zZSk7XG4gICAgdW5waXBlKCk7XG4gIH1cbiAgZGVzdC5vbmNlKCdmaW5pc2gnLCBvbmZpbmlzaCk7XG5cbiAgZnVuY3Rpb24gdW5waXBlKCkge1xuICAgIGRlYnVnKCd1bnBpcGUnKTtcbiAgICBzcmMudW5waXBlKGRlc3QpO1xuICB9XG5cbiAgLy8gdGVsbCB0aGUgZGVzdCB0aGF0IGl0J3MgYmVpbmcgcGlwZWQgdG9cbiAgZGVzdC5lbWl0KCdwaXBlJywgc3JjKTtcblxuICAvLyBzdGFydCB0aGUgZmxvdyBpZiBpdCBoYXNuJ3QgYmVlbiBzdGFydGVkIGFscmVhZHkuXG4gIGlmICghc3RhdGUuZmxvd2luZykge1xuICAgIGRlYnVnKCdwaXBlIHJlc3VtZScpO1xuICAgIHNyYy5yZXN1bWUoKTtcbiAgfVxuXG4gIHJldHVybiBkZXN0O1xufTtcblxuZnVuY3Rpb24gcGlwZU9uRHJhaW4oc3JjKSB7XG4gIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICB2YXIgc3RhdGUgPSBzcmMuX3JlYWRhYmxlU3RhdGU7XG4gICAgZGVidWcoJ3BpcGVPbkRyYWluJywgc3RhdGUuYXdhaXREcmFpbik7XG4gICAgaWYgKHN0YXRlLmF3YWl0RHJhaW4pXG4gICAgICBzdGF0ZS5hd2FpdERyYWluLS07XG4gICAgaWYgKHN0YXRlLmF3YWl0RHJhaW4gPT09IDAgJiYgRUUubGlzdGVuZXJDb3VudChzcmMsICdkYXRhJykpIHtcbiAgICAgIHN0YXRlLmZsb3dpbmcgPSB0cnVlO1xuICAgICAgZmxvdyhzcmMpO1xuICAgIH1cbiAgfTtcbn1cblxuXG5SZWFkYWJsZS5wcm90b3R5cGUudW5waXBlID0gZnVuY3Rpb24oZGVzdCkge1xuICB2YXIgc3RhdGUgPSB0aGlzLl9yZWFkYWJsZVN0YXRlO1xuXG4gIC8vIGlmIHdlJ3JlIG5vdCBwaXBpbmcgYW55d2hlcmUsIHRoZW4gZG8gbm90aGluZy5cbiAgaWYgKHN0YXRlLnBpcGVzQ291bnQgPT09IDApXG4gICAgcmV0dXJuIHRoaXM7XG5cbiAgLy8ganVzdCBvbmUgZGVzdGluYXRpb24uICBtb3N0IGNvbW1vbiBjYXNlLlxuICBpZiAoc3RhdGUucGlwZXNDb3VudCA9PT0gMSkge1xuICAgIC8vIHBhc3NlZCBpbiBvbmUsIGJ1dCBpdCdzIG5vdCB0aGUgcmlnaHQgb25lLlxuICAgIGlmIChkZXN0ICYmIGRlc3QgIT09IHN0YXRlLnBpcGVzKVxuICAgICAgcmV0dXJuIHRoaXM7XG5cbiAgICBpZiAoIWRlc3QpXG4gICAgICBkZXN0ID0gc3RhdGUucGlwZXM7XG5cbiAgICAvLyBnb3QgYSBtYXRjaC5cbiAgICBzdGF0ZS5waXBlcyA9IG51bGw7XG4gICAgc3RhdGUucGlwZXNDb3VudCA9IDA7XG4gICAgc3RhdGUuZmxvd2luZyA9IGZhbHNlO1xuICAgIGlmIChkZXN0KVxuICAgICAgZGVzdC5lbWl0KCd1bnBpcGUnLCB0aGlzKTtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIC8vIHNsb3cgY2FzZS4gbXVsdGlwbGUgcGlwZSBkZXN0aW5hdGlvbnMuXG5cbiAgaWYgKCFkZXN0KSB7XG4gICAgLy8gcmVtb3ZlIGFsbC5cbiAgICB2YXIgZGVzdHMgPSBzdGF0ZS5waXBlcztcbiAgICB2YXIgbGVuID0gc3RhdGUucGlwZXNDb3VudDtcbiAgICBzdGF0ZS5waXBlcyA9IG51bGw7XG4gICAgc3RhdGUucGlwZXNDb3VudCA9IDA7XG4gICAgc3RhdGUuZmxvd2luZyA9IGZhbHNlO1xuXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW47IGkrKylcbiAgICAgIGRlc3RzW2ldLmVtaXQoJ3VucGlwZScsIHRoaXMpO1xuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgLy8gdHJ5IHRvIGZpbmQgdGhlIHJpZ2h0IG9uZS5cbiAgdmFyIGkgPSBpbmRleE9mKHN0YXRlLnBpcGVzLCBkZXN0KTtcbiAgaWYgKGkgPT09IC0xKVxuICAgIHJldHVybiB0aGlzO1xuXG4gIHN0YXRlLnBpcGVzLnNwbGljZShpLCAxKTtcbiAgc3RhdGUucGlwZXNDb3VudCAtPSAxO1xuICBpZiAoc3RhdGUucGlwZXNDb3VudCA9PT0gMSlcbiAgICBzdGF0ZS5waXBlcyA9IHN0YXRlLnBpcGVzWzBdO1xuXG4gIGRlc3QuZW1pdCgndW5waXBlJywgdGhpcyk7XG5cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vLyBzZXQgdXAgZGF0YSBldmVudHMgaWYgdGhleSBhcmUgYXNrZWQgZm9yXG4vLyBFbnN1cmUgcmVhZGFibGUgbGlzdGVuZXJzIGV2ZW50dWFsbHkgZ2V0IHNvbWV0aGluZ1xuUmVhZGFibGUucHJvdG90eXBlLm9uID0gZnVuY3Rpb24oZXYsIGZuKSB7XG4gIHZhciByZXMgPSBTdHJlYW0ucHJvdG90eXBlLm9uLmNhbGwodGhpcywgZXYsIGZuKTtcblxuICAvLyBJZiBsaXN0ZW5pbmcgdG8gZGF0YSwgYW5kIGl0IGhhcyBub3QgZXhwbGljaXRseSBiZWVuIHBhdXNlZCxcbiAgLy8gdGhlbiBjYWxsIHJlc3VtZSB0byBzdGFydCB0aGUgZmxvdyBvZiBkYXRhIG9uIHRoZSBuZXh0IHRpY2suXG4gIGlmIChldiA9PT0gJ2RhdGEnICYmIGZhbHNlICE9PSB0aGlzLl9yZWFkYWJsZVN0YXRlLmZsb3dpbmcpIHtcbiAgICB0aGlzLnJlc3VtZSgpO1xuICB9XG5cbiAgaWYgKGV2ID09PSAncmVhZGFibGUnICYmIHRoaXMucmVhZGFibGUpIHtcbiAgICB2YXIgc3RhdGUgPSB0aGlzLl9yZWFkYWJsZVN0YXRlO1xuICAgIGlmICghc3RhdGUucmVhZGFibGVMaXN0ZW5pbmcpIHtcbiAgICAgIHN0YXRlLnJlYWRhYmxlTGlzdGVuaW5nID0gdHJ1ZTtcbiAgICAgIHN0YXRlLmVtaXR0ZWRSZWFkYWJsZSA9IGZhbHNlO1xuICAgICAgc3RhdGUubmVlZFJlYWRhYmxlID0gdHJ1ZTtcbiAgICAgIGlmICghc3RhdGUucmVhZGluZykge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHByb2Nlc3MubmV4dFRpY2soZnVuY3Rpb24oKSB7XG4gICAgICAgICAgZGVidWcoJ3JlYWRhYmxlIG5leHR0aWNrIHJlYWQgMCcpO1xuICAgICAgICAgIHNlbGYucmVhZCgwKTtcbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2UgaWYgKHN0YXRlLmxlbmd0aCkge1xuICAgICAgICBlbWl0UmVhZGFibGUodGhpcywgc3RhdGUpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiByZXM7XG59O1xuUmVhZGFibGUucHJvdG90eXBlLmFkZExpc3RlbmVyID0gUmVhZGFibGUucHJvdG90eXBlLm9uO1xuXG4vLyBwYXVzZSgpIGFuZCByZXN1bWUoKSBhcmUgcmVtbmFudHMgb2YgdGhlIGxlZ2FjeSByZWFkYWJsZSBzdHJlYW0gQVBJXG4vLyBJZiB0aGUgdXNlciB1c2VzIHRoZW0sIHRoZW4gc3dpdGNoIGludG8gb2xkIG1vZGUuXG5SZWFkYWJsZS5wcm90b3R5cGUucmVzdW1lID0gZnVuY3Rpb24oKSB7XG4gIHZhciBzdGF0ZSA9IHRoaXMuX3JlYWRhYmxlU3RhdGU7XG4gIGlmICghc3RhdGUuZmxvd2luZykge1xuICAgIGRlYnVnKCdyZXN1bWUnKTtcbiAgICBzdGF0ZS5mbG93aW5nID0gdHJ1ZTtcbiAgICBpZiAoIXN0YXRlLnJlYWRpbmcpIHtcbiAgICAgIGRlYnVnKCdyZXN1bWUgcmVhZCAwJyk7XG4gICAgICB0aGlzLnJlYWQoMCk7XG4gICAgfVxuICAgIHJlc3VtZSh0aGlzLCBzdGF0ZSk7XG4gIH1cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5mdW5jdGlvbiByZXN1bWUoc3RyZWFtLCBzdGF0ZSkge1xuICBpZiAoIXN0YXRlLnJlc3VtZVNjaGVkdWxlZCkge1xuICAgIHN0YXRlLnJlc3VtZVNjaGVkdWxlZCA9IHRydWU7XG4gICAgcHJvY2Vzcy5uZXh0VGljayhmdW5jdGlvbigpIHtcbiAgICAgIHJlc3VtZV8oc3RyZWFtLCBzdGF0ZSk7XG4gICAgfSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gcmVzdW1lXyhzdHJlYW0sIHN0YXRlKSB7XG4gIHN0YXRlLnJlc3VtZVNjaGVkdWxlZCA9IGZhbHNlO1xuICBzdHJlYW0uZW1pdCgncmVzdW1lJyk7XG4gIGZsb3coc3RyZWFtKTtcbiAgaWYgKHN0YXRlLmZsb3dpbmcgJiYgIXN0YXRlLnJlYWRpbmcpXG4gICAgc3RyZWFtLnJlYWQoMCk7XG59XG5cblJlYWRhYmxlLnByb3RvdHlwZS5wYXVzZSA9IGZ1bmN0aW9uKCkge1xuICBkZWJ1ZygnY2FsbCBwYXVzZSBmbG93aW5nPSVqJywgdGhpcy5fcmVhZGFibGVTdGF0ZS5mbG93aW5nKTtcbiAgaWYgKGZhbHNlICE9PSB0aGlzLl9yZWFkYWJsZVN0YXRlLmZsb3dpbmcpIHtcbiAgICBkZWJ1ZygncGF1c2UnKTtcbiAgICB0aGlzLl9yZWFkYWJsZVN0YXRlLmZsb3dpbmcgPSBmYWxzZTtcbiAgICB0aGlzLmVtaXQoJ3BhdXNlJyk7XG4gIH1cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5mdW5jdGlvbiBmbG93KHN0cmVhbSkge1xuICB2YXIgc3RhdGUgPSBzdHJlYW0uX3JlYWRhYmxlU3RhdGU7XG4gIGRlYnVnKCdmbG93Jywgc3RhdGUuZmxvd2luZyk7XG4gIGlmIChzdGF0ZS5mbG93aW5nKSB7XG4gICAgZG8ge1xuICAgICAgdmFyIGNodW5rID0gc3RyZWFtLnJlYWQoKTtcbiAgICB9IHdoaWxlIChudWxsICE9PSBjaHVuayAmJiBzdGF0ZS5mbG93aW5nKTtcbiAgfVxufVxuXG4vLyB3cmFwIGFuIG9sZC1zdHlsZSBzdHJlYW0gYXMgdGhlIGFzeW5jIGRhdGEgc291cmNlLlxuLy8gVGhpcyBpcyAqbm90KiBwYXJ0IG9mIHRoZSByZWFkYWJsZSBzdHJlYW0gaW50ZXJmYWNlLlxuLy8gSXQgaXMgYW4gdWdseSB1bmZvcnR1bmF0ZSBtZXNzIG9mIGhpc3RvcnkuXG5SZWFkYWJsZS5wcm90b3R5cGUud3JhcCA9IGZ1bmN0aW9uKHN0cmVhbSkge1xuICB2YXIgc3RhdGUgPSB0aGlzLl9yZWFkYWJsZVN0YXRlO1xuICB2YXIgcGF1c2VkID0gZmFsc2U7XG5cbiAgdmFyIHNlbGYgPSB0aGlzO1xuICBzdHJlYW0ub24oJ2VuZCcsIGZ1bmN0aW9uKCkge1xuICAgIGRlYnVnKCd3cmFwcGVkIGVuZCcpO1xuICAgIGlmIChzdGF0ZS5kZWNvZGVyICYmICFzdGF0ZS5lbmRlZCkge1xuICAgICAgdmFyIGNodW5rID0gc3RhdGUuZGVjb2Rlci5lbmQoKTtcbiAgICAgIGlmIChjaHVuayAmJiBjaHVuay5sZW5ndGgpXG4gICAgICAgIHNlbGYucHVzaChjaHVuayk7XG4gICAgfVxuXG4gICAgc2VsZi5wdXNoKG51bGwpO1xuICB9KTtcblxuICBzdHJlYW0ub24oJ2RhdGEnLCBmdW5jdGlvbihjaHVuaykge1xuICAgIGRlYnVnKCd3cmFwcGVkIGRhdGEnKTtcbiAgICBpZiAoc3RhdGUuZGVjb2RlcilcbiAgICAgIGNodW5rID0gc3RhdGUuZGVjb2Rlci53cml0ZShjaHVuayk7XG4gICAgaWYgKCFjaHVuayB8fCAhc3RhdGUub2JqZWN0TW9kZSAmJiAhY2h1bmsubGVuZ3RoKVxuICAgICAgcmV0dXJuO1xuXG4gICAgdmFyIHJldCA9IHNlbGYucHVzaChjaHVuayk7XG4gICAgaWYgKCFyZXQpIHtcbiAgICAgIHBhdXNlZCA9IHRydWU7XG4gICAgICBzdHJlYW0ucGF1c2UoKTtcbiAgICB9XG4gIH0pO1xuXG4gIC8vIHByb3h5IGFsbCB0aGUgb3RoZXIgbWV0aG9kcy5cbiAgLy8gaW1wb3J0YW50IHdoZW4gd3JhcHBpbmcgZmlsdGVycyBhbmQgZHVwbGV4ZXMuXG4gIGZvciAodmFyIGkgaW4gc3RyZWFtKSB7XG4gICAgaWYgKHV0aWwuaXNGdW5jdGlvbihzdHJlYW1baV0pICYmIHV0aWwuaXNVbmRlZmluZWQodGhpc1tpXSkpIHtcbiAgICAgIHRoaXNbaV0gPSBmdW5jdGlvbihtZXRob2QpIHsgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gc3RyZWFtW21ldGhvZF0uYXBwbHkoc3RyZWFtLCBhcmd1bWVudHMpO1xuICAgICAgfX0oaSk7XG4gICAgfVxuICB9XG5cbiAgLy8gcHJveHkgY2VydGFpbiBpbXBvcnRhbnQgZXZlbnRzLlxuICB2YXIgZXZlbnRzID0gWydlcnJvcicsICdjbG9zZScsICdkZXN0cm95JywgJ3BhdXNlJywgJ3Jlc3VtZSddO1xuICBmb3JFYWNoKGV2ZW50cywgZnVuY3Rpb24oZXYpIHtcbiAgICBzdHJlYW0ub24oZXYsIHNlbGYuZW1pdC5iaW5kKHNlbGYsIGV2KSk7XG4gIH0pO1xuXG4gIC8vIHdoZW4gd2UgdHJ5IHRvIGNvbnN1bWUgc29tZSBtb3JlIGJ5dGVzLCBzaW1wbHkgdW5wYXVzZSB0aGVcbiAgLy8gdW5kZXJseWluZyBzdHJlYW0uXG4gIHNlbGYuX3JlYWQgPSBmdW5jdGlvbihuKSB7XG4gICAgZGVidWcoJ3dyYXBwZWQgX3JlYWQnLCBuKTtcbiAgICBpZiAocGF1c2VkKSB7XG4gICAgICBwYXVzZWQgPSBmYWxzZTtcbiAgICAgIHN0cmVhbS5yZXN1bWUoKTtcbiAgICB9XG4gIH07XG5cbiAgcmV0dXJuIHNlbGY7XG59O1xuXG5cblxuLy8gZXhwb3NlZCBmb3IgdGVzdGluZyBwdXJwb3NlcyBvbmx5LlxuUmVhZGFibGUuX2Zyb21MaXN0ID0gZnJvbUxpc3Q7XG5cbi8vIFBsdWNrIG9mZiBuIGJ5dGVzIGZyb20gYW4gYXJyYXkgb2YgYnVmZmVycy5cbi8vIExlbmd0aCBpcyB0aGUgY29tYmluZWQgbGVuZ3RocyBvZiBhbGwgdGhlIGJ1ZmZlcnMgaW4gdGhlIGxpc3QuXG5mdW5jdGlvbiBmcm9tTGlzdChuLCBzdGF0ZSkge1xuICB2YXIgbGlzdCA9IHN0YXRlLmJ1ZmZlcjtcbiAgdmFyIGxlbmd0aCA9IHN0YXRlLmxlbmd0aDtcbiAgdmFyIHN0cmluZ01vZGUgPSAhIXN0YXRlLmRlY29kZXI7XG4gIHZhciBvYmplY3RNb2RlID0gISFzdGF0ZS5vYmplY3RNb2RlO1xuICB2YXIgcmV0O1xuXG4gIC8vIG5vdGhpbmcgaW4gdGhlIGxpc3QsIGRlZmluaXRlbHkgZW1wdHkuXG4gIGlmIChsaXN0Lmxlbmd0aCA9PT0gMClcbiAgICByZXR1cm4gbnVsbDtcblxuICBpZiAobGVuZ3RoID09PSAwKVxuICAgIHJldCA9IG51bGw7XG4gIGVsc2UgaWYgKG9iamVjdE1vZGUpXG4gICAgcmV0ID0gbGlzdC5zaGlmdCgpO1xuICBlbHNlIGlmICghbiB8fCBuID49IGxlbmd0aCkge1xuICAgIC8vIHJlYWQgaXQgYWxsLCB0cnVuY2F0ZSB0aGUgYXJyYXkuXG4gICAgaWYgKHN0cmluZ01vZGUpXG4gICAgICByZXQgPSBsaXN0LmpvaW4oJycpO1xuICAgIGVsc2VcbiAgICAgIHJldCA9IEJ1ZmZlci5jb25jYXQobGlzdCwgbGVuZ3RoKTtcbiAgICBsaXN0Lmxlbmd0aCA9IDA7XG4gIH0gZWxzZSB7XG4gICAgLy8gcmVhZCBqdXN0IHNvbWUgb2YgaXQuXG4gICAgaWYgKG4gPCBsaXN0WzBdLmxlbmd0aCkge1xuICAgICAgLy8ganVzdCB0YWtlIGEgcGFydCBvZiB0aGUgZmlyc3QgbGlzdCBpdGVtLlxuICAgICAgLy8gc2xpY2UgaXMgdGhlIHNhbWUgZm9yIGJ1ZmZlcnMgYW5kIHN0cmluZ3MuXG4gICAgICB2YXIgYnVmID0gbGlzdFswXTtcbiAgICAgIHJldCA9IGJ1Zi5zbGljZSgwLCBuKTtcbiAgICAgIGxpc3RbMF0gPSBidWYuc2xpY2Uobik7XG4gICAgfSBlbHNlIGlmIChuID09PSBsaXN0WzBdLmxlbmd0aCkge1xuICAgICAgLy8gZmlyc3QgbGlzdCBpcyBhIHBlcmZlY3QgbWF0Y2hcbiAgICAgIHJldCA9IGxpc3Quc2hpZnQoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gY29tcGxleCBjYXNlLlxuICAgICAgLy8gd2UgaGF2ZSBlbm91Z2ggdG8gY292ZXIgaXQsIGJ1dCBpdCBzcGFucyBwYXN0IHRoZSBmaXJzdCBidWZmZXIuXG4gICAgICBpZiAoc3RyaW5nTW9kZSlcbiAgICAgICAgcmV0ID0gJyc7XG4gICAgICBlbHNlXG4gICAgICAgIHJldCA9IG5ldyBCdWZmZXIobik7XG5cbiAgICAgIHZhciBjID0gMDtcbiAgICAgIGZvciAodmFyIGkgPSAwLCBsID0gbGlzdC5sZW5ndGg7IGkgPCBsICYmIGMgPCBuOyBpKyspIHtcbiAgICAgICAgdmFyIGJ1ZiA9IGxpc3RbMF07XG4gICAgICAgIHZhciBjcHkgPSBNYXRoLm1pbihuIC0gYywgYnVmLmxlbmd0aCk7XG5cbiAgICAgICAgaWYgKHN0cmluZ01vZGUpXG4gICAgICAgICAgcmV0ICs9IGJ1Zi5zbGljZSgwLCBjcHkpO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgYnVmLmNvcHkocmV0LCBjLCAwLCBjcHkpO1xuXG4gICAgICAgIGlmIChjcHkgPCBidWYubGVuZ3RoKVxuICAgICAgICAgIGxpc3RbMF0gPSBidWYuc2xpY2UoY3B5KTtcbiAgICAgICAgZWxzZVxuICAgICAgICAgIGxpc3Quc2hpZnQoKTtcblxuICAgICAgICBjICs9IGNweTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4gcmV0O1xufVxuXG5mdW5jdGlvbiBlbmRSZWFkYWJsZShzdHJlYW0pIHtcbiAgdmFyIHN0YXRlID0gc3RyZWFtLl9yZWFkYWJsZVN0YXRlO1xuXG4gIC8vIElmIHdlIGdldCBoZXJlIGJlZm9yZSBjb25zdW1pbmcgYWxsIHRoZSBieXRlcywgdGhlbiB0aGF0IGlzIGFcbiAgLy8gYnVnIGluIG5vZGUuICBTaG91bGQgbmV2ZXIgaGFwcGVuLlxuICBpZiAoc3RhdGUubGVuZ3RoID4gMClcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ2VuZFJlYWRhYmxlIGNhbGxlZCBvbiBub24tZW1wdHkgc3RyZWFtJyk7XG5cbiAgaWYgKCFzdGF0ZS5lbmRFbWl0dGVkKSB7XG4gICAgc3RhdGUuZW5kZWQgPSB0cnVlO1xuICAgIHByb2Nlc3MubmV4dFRpY2soZnVuY3Rpb24oKSB7XG4gICAgICAvLyBDaGVjayB0aGF0IHdlIGRpZG4ndCBnZXQgb25lIGxhc3QgdW5zaGlmdC5cbiAgICAgIGlmICghc3RhdGUuZW5kRW1pdHRlZCAmJiBzdGF0ZS5sZW5ndGggPT09IDApIHtcbiAgICAgICAgc3RhdGUuZW5kRW1pdHRlZCA9IHRydWU7XG4gICAgICAgIHN0cmVhbS5yZWFkYWJsZSA9IGZhbHNlO1xuICAgICAgICBzdHJlYW0uZW1pdCgnZW5kJyk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gZm9yRWFjaCAoeHMsIGYpIHtcbiAgZm9yICh2YXIgaSA9IDAsIGwgPSB4cy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICBmKHhzW2ldLCBpKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBpbmRleE9mICh4cywgeCkge1xuICBmb3IgKHZhciBpID0gMCwgbCA9IHhzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgIGlmICh4c1tpXSA9PT0geCkgcmV0dXJuIGk7XG4gIH1cbiAgcmV0dXJuIC0xO1xufVxuIiwiLy8gQ29weXJpZ2h0IEpveWVudCwgSW5jLiBhbmQgb3RoZXIgTm9kZSBjb250cmlidXRvcnMuXG4vL1xuLy8gUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGFcbi8vIGNvcHkgb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGVcbi8vIFwiU29mdHdhcmVcIiksIHRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZ1xuLy8gd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLFxuLy8gZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdFxuLy8gcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlXG4vLyBmb2xsb3dpbmcgY29uZGl0aW9uczpcbi8vXG4vLyBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZFxuLy8gaW4gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4vL1xuLy8gVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTU1xuLy8gT1IgSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRlxuLy8gTUVSQ0hBTlRBQklMSVRZLCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTlxuLy8gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sXG4vLyBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1Jcbi8vIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEVcbi8vIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXG5cblxuLy8gYSB0cmFuc2Zvcm0gc3RyZWFtIGlzIGEgcmVhZGFibGUvd3JpdGFibGUgc3RyZWFtIHdoZXJlIHlvdSBkb1xuLy8gc29tZXRoaW5nIHdpdGggdGhlIGRhdGEuICBTb21ldGltZXMgaXQncyBjYWxsZWQgYSBcImZpbHRlclwiLFxuLy8gYnV0IHRoYXQncyBub3QgYSBncmVhdCBuYW1lIGZvciBpdCwgc2luY2UgdGhhdCBpbXBsaWVzIGEgdGhpbmcgd2hlcmVcbi8vIHNvbWUgYml0cyBwYXNzIHRocm91Z2gsIGFuZCBvdGhlcnMgYXJlIHNpbXBseSBpZ25vcmVkLiAgKFRoYXQgd291bGRcbi8vIGJlIGEgdmFsaWQgZXhhbXBsZSBvZiBhIHRyYW5zZm9ybSwgb2YgY291cnNlLilcbi8vXG4vLyBXaGlsZSB0aGUgb3V0cHV0IGlzIGNhdXNhbGx5IHJlbGF0ZWQgdG8gdGhlIGlucHV0LCBpdCdzIG5vdCBhXG4vLyBuZWNlc3NhcmlseSBzeW1tZXRyaWMgb3Igc3luY2hyb25vdXMgdHJhbnNmb3JtYXRpb24uICBGb3IgZXhhbXBsZSxcbi8vIGEgemxpYiBzdHJlYW0gbWlnaHQgdGFrZSBtdWx0aXBsZSBwbGFpbi10ZXh0IHdyaXRlcygpLCBhbmQgdGhlblxuLy8gZW1pdCBhIHNpbmdsZSBjb21wcmVzc2VkIGNodW5rIHNvbWUgdGltZSBpbiB0aGUgZnV0dXJlLlxuLy9cbi8vIEhlcmUncyBob3cgdGhpcyB3b3Jrczpcbi8vXG4vLyBUaGUgVHJhbnNmb3JtIHN0cmVhbSBoYXMgYWxsIHRoZSBhc3BlY3RzIG9mIHRoZSByZWFkYWJsZSBhbmQgd3JpdGFibGVcbi8vIHN0cmVhbSBjbGFzc2VzLiAgV2hlbiB5b3Ugd3JpdGUoY2h1bmspLCB0aGF0IGNhbGxzIF93cml0ZShjaHVuayxjYilcbi8vIGludGVybmFsbHksIGFuZCByZXR1cm5zIGZhbHNlIGlmIHRoZXJlJ3MgYSBsb3Qgb2YgcGVuZGluZyB3cml0ZXNcbi8vIGJ1ZmZlcmVkIHVwLiAgV2hlbiB5b3UgY2FsbCByZWFkKCksIHRoYXQgY2FsbHMgX3JlYWQobikgdW50aWxcbi8vIHRoZXJlJ3MgZW5vdWdoIHBlbmRpbmcgcmVhZGFibGUgZGF0YSBidWZmZXJlZCB1cC5cbi8vXG4vLyBJbiBhIHRyYW5zZm9ybSBzdHJlYW0sIHRoZSB3cml0dGVuIGRhdGEgaXMgcGxhY2VkIGluIGEgYnVmZmVyLiAgV2hlblxuLy8gX3JlYWQobikgaXMgY2FsbGVkLCBpdCB0cmFuc2Zvcm1zIHRoZSBxdWV1ZWQgdXAgZGF0YSwgY2FsbGluZyB0aGVcbi8vIGJ1ZmZlcmVkIF93cml0ZSBjYidzIGFzIGl0IGNvbnN1bWVzIGNodW5rcy4gIElmIGNvbnN1bWluZyBhIHNpbmdsZVxuLy8gd3JpdHRlbiBjaHVuayB3b3VsZCByZXN1bHQgaW4gbXVsdGlwbGUgb3V0cHV0IGNodW5rcywgdGhlbiB0aGUgZmlyc3Rcbi8vIG91dHB1dHRlZCBiaXQgY2FsbHMgdGhlIHJlYWRjYiwgYW5kIHN1YnNlcXVlbnQgY2h1bmtzIGp1c3QgZ28gaW50b1xuLy8gdGhlIHJlYWQgYnVmZmVyLCBhbmQgd2lsbCBjYXVzZSBpdCB0byBlbWl0ICdyZWFkYWJsZScgaWYgbmVjZXNzYXJ5LlxuLy9cbi8vIFRoaXMgd2F5LCBiYWNrLXByZXNzdXJlIGlzIGFjdHVhbGx5IGRldGVybWluZWQgYnkgdGhlIHJlYWRpbmcgc2lkZSxcbi8vIHNpbmNlIF9yZWFkIGhhcyB0byBiZSBjYWxsZWQgdG8gc3RhcnQgcHJvY2Vzc2luZyBhIG5ldyBjaHVuay4gIEhvd2V2ZXIsXG4vLyBhIHBhdGhvbG9naWNhbCBpbmZsYXRlIHR5cGUgb2YgdHJhbnNmb3JtIGNhbiBjYXVzZSBleGNlc3NpdmUgYnVmZmVyaW5nXG4vLyBoZXJlLiAgRm9yIGV4YW1wbGUsIGltYWdpbmUgYSBzdHJlYW0gd2hlcmUgZXZlcnkgYnl0ZSBvZiBpbnB1dCBpc1xuLy8gaW50ZXJwcmV0ZWQgYXMgYW4gaW50ZWdlciBmcm9tIDAtMjU1LCBhbmQgdGhlbiByZXN1bHRzIGluIHRoYXQgbWFueVxuLy8gYnl0ZXMgb2Ygb3V0cHV0LiAgV3JpdGluZyB0aGUgNCBieXRlcyB7ZmYsZmYsZmYsZmZ9IHdvdWxkIHJlc3VsdCBpblxuLy8gMWtiIG9mIGRhdGEgYmVpbmcgb3V0cHV0LiAgSW4gdGhpcyBjYXNlLCB5b3UgY291bGQgd3JpdGUgYSB2ZXJ5IHNtYWxsXG4vLyBhbW91bnQgb2YgaW5wdXQsIGFuZCBlbmQgdXAgd2l0aCBhIHZlcnkgbGFyZ2UgYW1vdW50IG9mIG91dHB1dC4gIEluXG4vLyBzdWNoIGEgcGF0aG9sb2dpY2FsIGluZmxhdGluZyBtZWNoYW5pc20sIHRoZXJlJ2QgYmUgbm8gd2F5IHRvIHRlbGxcbi8vIHRoZSBzeXN0ZW0gdG8gc3RvcCBkb2luZyB0aGUgdHJhbnNmb3JtLiAgQSBzaW5nbGUgNE1CIHdyaXRlIGNvdWxkXG4vLyBjYXVzZSB0aGUgc3lzdGVtIHRvIHJ1biBvdXQgb2YgbWVtb3J5LlxuLy9cbi8vIEhvd2V2ZXIsIGV2ZW4gaW4gc3VjaCBhIHBhdGhvbG9naWNhbCBjYXNlLCBvbmx5IGEgc2luZ2xlIHdyaXR0ZW4gY2h1bmtcbi8vIHdvdWxkIGJlIGNvbnN1bWVkLCBhbmQgdGhlbiB0aGUgcmVzdCB3b3VsZCB3YWl0ICh1bi10cmFuc2Zvcm1lZCkgdW50aWxcbi8vIHRoZSByZXN1bHRzIG9mIHRoZSBwcmV2aW91cyB0cmFuc2Zvcm1lZCBjaHVuayB3ZXJlIGNvbnN1bWVkLlxuXG5tb2R1bGUuZXhwb3J0cyA9IFRyYW5zZm9ybTtcblxudmFyIER1cGxleCA9IHJlcXVpcmUoJy4vX3N0cmVhbV9kdXBsZXgnKTtcblxuLyo8cmVwbGFjZW1lbnQ+Ki9cbnZhciB1dGlsID0gcmVxdWlyZSgnY29yZS11dGlsLWlzJyk7XG51dGlsLmluaGVyaXRzID0gcmVxdWlyZSgnaW5oZXJpdHMnKTtcbi8qPC9yZXBsYWNlbWVudD4qL1xuXG51dGlsLmluaGVyaXRzKFRyYW5zZm9ybSwgRHVwbGV4KTtcblxuXG5mdW5jdGlvbiBUcmFuc2Zvcm1TdGF0ZShvcHRpb25zLCBzdHJlYW0pIHtcbiAgdGhpcy5hZnRlclRyYW5zZm9ybSA9IGZ1bmN0aW9uKGVyLCBkYXRhKSB7XG4gICAgcmV0dXJuIGFmdGVyVHJhbnNmb3JtKHN0cmVhbSwgZXIsIGRhdGEpO1xuICB9O1xuXG4gIHRoaXMubmVlZFRyYW5zZm9ybSA9IGZhbHNlO1xuICB0aGlzLnRyYW5zZm9ybWluZyA9IGZhbHNlO1xuICB0aGlzLndyaXRlY2IgPSBudWxsO1xuICB0aGlzLndyaXRlY2h1bmsgPSBudWxsO1xufVxuXG5mdW5jdGlvbiBhZnRlclRyYW5zZm9ybShzdHJlYW0sIGVyLCBkYXRhKSB7XG4gIHZhciB0cyA9IHN0cmVhbS5fdHJhbnNmb3JtU3RhdGU7XG4gIHRzLnRyYW5zZm9ybWluZyA9IGZhbHNlO1xuXG4gIHZhciBjYiA9IHRzLndyaXRlY2I7XG5cbiAgaWYgKCFjYilcbiAgICByZXR1cm4gc3RyZWFtLmVtaXQoJ2Vycm9yJywgbmV3IEVycm9yKCdubyB3cml0ZWNiIGluIFRyYW5zZm9ybSBjbGFzcycpKTtcblxuICB0cy53cml0ZWNodW5rID0gbnVsbDtcbiAgdHMud3JpdGVjYiA9IG51bGw7XG5cbiAgaWYgKCF1dGlsLmlzTnVsbE9yVW5kZWZpbmVkKGRhdGEpKVxuICAgIHN0cmVhbS5wdXNoKGRhdGEpO1xuXG4gIGlmIChjYilcbiAgICBjYihlcik7XG5cbiAgdmFyIHJzID0gc3RyZWFtLl9yZWFkYWJsZVN0YXRlO1xuICBycy5yZWFkaW5nID0gZmFsc2U7XG4gIGlmIChycy5uZWVkUmVhZGFibGUgfHwgcnMubGVuZ3RoIDwgcnMuaGlnaFdhdGVyTWFyaykge1xuICAgIHN0cmVhbS5fcmVhZChycy5oaWdoV2F0ZXJNYXJrKTtcbiAgfVxufVxuXG5cbmZ1bmN0aW9uIFRyYW5zZm9ybShvcHRpb25zKSB7XG4gIGlmICghKHRoaXMgaW5zdGFuY2VvZiBUcmFuc2Zvcm0pKVxuICAgIHJldHVybiBuZXcgVHJhbnNmb3JtKG9wdGlvbnMpO1xuXG4gIER1cGxleC5jYWxsKHRoaXMsIG9wdGlvbnMpO1xuXG4gIHRoaXMuX3RyYW5zZm9ybVN0YXRlID0gbmV3IFRyYW5zZm9ybVN0YXRlKG9wdGlvbnMsIHRoaXMpO1xuXG4gIC8vIHdoZW4gdGhlIHdyaXRhYmxlIHNpZGUgZmluaXNoZXMsIHRoZW4gZmx1c2ggb3V0IGFueXRoaW5nIHJlbWFpbmluZy5cbiAgdmFyIHN0cmVhbSA9IHRoaXM7XG5cbiAgLy8gc3RhcnQgb3V0IGFza2luZyBmb3IgYSByZWFkYWJsZSBldmVudCBvbmNlIGRhdGEgaXMgdHJhbnNmb3JtZWQuXG4gIHRoaXMuX3JlYWRhYmxlU3RhdGUubmVlZFJlYWRhYmxlID0gdHJ1ZTtcblxuICAvLyB3ZSBoYXZlIGltcGxlbWVudGVkIHRoZSBfcmVhZCBtZXRob2QsIGFuZCBkb25lIHRoZSBvdGhlciB0aGluZ3NcbiAgLy8gdGhhdCBSZWFkYWJsZSB3YW50cyBiZWZvcmUgdGhlIGZpcnN0IF9yZWFkIGNhbGwsIHNvIHVuc2V0IHRoZVxuICAvLyBzeW5jIGd1YXJkIGZsYWcuXG4gIHRoaXMuX3JlYWRhYmxlU3RhdGUuc3luYyA9IGZhbHNlO1xuXG4gIHRoaXMub25jZSgncHJlZmluaXNoJywgZnVuY3Rpb24oKSB7XG4gICAgaWYgKHV0aWwuaXNGdW5jdGlvbih0aGlzLl9mbHVzaCkpXG4gICAgICB0aGlzLl9mbHVzaChmdW5jdGlvbihlcikge1xuICAgICAgICBkb25lKHN0cmVhbSwgZXIpO1xuICAgICAgfSk7XG4gICAgZWxzZVxuICAgICAgZG9uZShzdHJlYW0pO1xuICB9KTtcbn1cblxuVHJhbnNmb3JtLnByb3RvdHlwZS5wdXNoID0gZnVuY3Rpb24oY2h1bmssIGVuY29kaW5nKSB7XG4gIHRoaXMuX3RyYW5zZm9ybVN0YXRlLm5lZWRUcmFuc2Zvcm0gPSBmYWxzZTtcbiAgcmV0dXJuIER1cGxleC5wcm90b3R5cGUucHVzaC5jYWxsKHRoaXMsIGNodW5rLCBlbmNvZGluZyk7XG59O1xuXG4vLyBUaGlzIGlzIHRoZSBwYXJ0IHdoZXJlIHlvdSBkbyBzdHVmZiFcbi8vIG92ZXJyaWRlIHRoaXMgZnVuY3Rpb24gaW4gaW1wbGVtZW50YXRpb24gY2xhc3Nlcy5cbi8vICdjaHVuaycgaXMgYW4gaW5wdXQgY2h1bmsuXG4vL1xuLy8gQ2FsbCBgcHVzaChuZXdDaHVuaylgIHRvIHBhc3MgYWxvbmcgdHJhbnNmb3JtZWQgb3V0cHV0XG4vLyB0byB0aGUgcmVhZGFibGUgc2lkZS4gIFlvdSBtYXkgY2FsbCAncHVzaCcgemVybyBvciBtb3JlIHRpbWVzLlxuLy9cbi8vIENhbGwgYGNiKGVycilgIHdoZW4geW91IGFyZSBkb25lIHdpdGggdGhpcyBjaHVuay4gIElmIHlvdSBwYXNzXG4vLyBhbiBlcnJvciwgdGhlbiB0aGF0J2xsIHB1dCB0aGUgaHVydCBvbiB0aGUgd2hvbGUgb3BlcmF0aW9uLiAgSWYgeW91XG4vLyBuZXZlciBjYWxsIGNiKCksIHRoZW4geW91J2xsIG5ldmVyIGdldCBhbm90aGVyIGNodW5rLlxuVHJhbnNmb3JtLnByb3RvdHlwZS5fdHJhbnNmb3JtID0gZnVuY3Rpb24oY2h1bmssIGVuY29kaW5nLCBjYikge1xuICB0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpO1xufTtcblxuVHJhbnNmb3JtLnByb3RvdHlwZS5fd3JpdGUgPSBmdW5jdGlvbihjaHVuaywgZW5jb2RpbmcsIGNiKSB7XG4gIHZhciB0cyA9IHRoaXMuX3RyYW5zZm9ybVN0YXRlO1xuICB0cy53cml0ZWNiID0gY2I7XG4gIHRzLndyaXRlY2h1bmsgPSBjaHVuaztcbiAgdHMud3JpdGVlbmNvZGluZyA9IGVuY29kaW5nO1xuICBpZiAoIXRzLnRyYW5zZm9ybWluZykge1xuICAgIHZhciBycyA9IHRoaXMuX3JlYWRhYmxlU3RhdGU7XG4gICAgaWYgKHRzLm5lZWRUcmFuc2Zvcm0gfHxcbiAgICAgICAgcnMubmVlZFJlYWRhYmxlIHx8XG4gICAgICAgIHJzLmxlbmd0aCA8IHJzLmhpZ2hXYXRlck1hcmspXG4gICAgICB0aGlzLl9yZWFkKHJzLmhpZ2hXYXRlck1hcmspO1xuICB9XG59O1xuXG4vLyBEb2Vzbid0IG1hdHRlciB3aGF0IHRoZSBhcmdzIGFyZSBoZXJlLlxuLy8gX3RyYW5zZm9ybSBkb2VzIGFsbCB0aGUgd29yay5cbi8vIFRoYXQgd2UgZ290IGhlcmUgbWVhbnMgdGhhdCB0aGUgcmVhZGFibGUgc2lkZSB3YW50cyBtb3JlIGRhdGEuXG5UcmFuc2Zvcm0ucHJvdG90eXBlLl9yZWFkID0gZnVuY3Rpb24obikge1xuICB2YXIgdHMgPSB0aGlzLl90cmFuc2Zvcm1TdGF0ZTtcblxuICBpZiAoIXV0aWwuaXNOdWxsKHRzLndyaXRlY2h1bmspICYmIHRzLndyaXRlY2IgJiYgIXRzLnRyYW5zZm9ybWluZykge1xuICAgIHRzLnRyYW5zZm9ybWluZyA9IHRydWU7XG4gICAgdGhpcy5fdHJhbnNmb3JtKHRzLndyaXRlY2h1bmssIHRzLndyaXRlZW5jb2RpbmcsIHRzLmFmdGVyVHJhbnNmb3JtKTtcbiAgfSBlbHNlIHtcbiAgICAvLyBtYXJrIHRoYXQgd2UgbmVlZCBhIHRyYW5zZm9ybSwgc28gdGhhdCBhbnkgZGF0YSB0aGF0IGNvbWVzIGluXG4gICAgLy8gd2lsbCBnZXQgcHJvY2Vzc2VkLCBub3cgdGhhdCB3ZSd2ZSBhc2tlZCBmb3IgaXQuXG4gICAgdHMubmVlZFRyYW5zZm9ybSA9IHRydWU7XG4gIH1cbn07XG5cblxuZnVuY3Rpb24gZG9uZShzdHJlYW0sIGVyKSB7XG4gIGlmIChlcilcbiAgICByZXR1cm4gc3RyZWFtLmVtaXQoJ2Vycm9yJywgZXIpO1xuXG4gIC8vIGlmIHRoZXJlJ3Mgbm90aGluZyBpbiB0aGUgd3JpdGUgYnVmZmVyLCB0aGVuIHRoYXQgbWVhbnNcbiAgLy8gdGhhdCBub3RoaW5nIG1vcmUgd2lsbCBldmVyIGJlIHByb3ZpZGVkXG4gIHZhciB3cyA9IHN0cmVhbS5fd3JpdGFibGVTdGF0ZTtcbiAgdmFyIHRzID0gc3RyZWFtLl90cmFuc2Zvcm1TdGF0ZTtcblxuICBpZiAod3MubGVuZ3RoKVxuICAgIHRocm93IG5ldyBFcnJvcignY2FsbGluZyB0cmFuc2Zvcm0gZG9uZSB3aGVuIHdzLmxlbmd0aCAhPSAwJyk7XG5cbiAgaWYgKHRzLnRyYW5zZm9ybWluZylcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ2NhbGxpbmcgdHJhbnNmb3JtIGRvbmUgd2hlbiBzdGlsbCB0cmFuc2Zvcm1pbmcnKTtcblxuICByZXR1cm4gc3RyZWFtLnB1c2gobnVsbCk7XG59XG4iLCIvLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxuLy8gQSBiaXQgc2ltcGxlciB0aGFuIHJlYWRhYmxlIHN0cmVhbXMuXG4vLyBJbXBsZW1lbnQgYW4gYXN5bmMgLl93cml0ZShjaHVuaywgY2IpLCBhbmQgaXQnbGwgaGFuZGxlIGFsbFxuLy8gdGhlIGRyYWluIGV2ZW50IGVtaXNzaW9uIGFuZCBidWZmZXJpbmcuXG5cbm1vZHVsZS5leHBvcnRzID0gV3JpdGFibGU7XG5cbi8qPHJlcGxhY2VtZW50PiovXG52YXIgQnVmZmVyID0gcmVxdWlyZSgnYnVmZmVyJykuQnVmZmVyO1xuLyo8L3JlcGxhY2VtZW50PiovXG5cbldyaXRhYmxlLldyaXRhYmxlU3RhdGUgPSBXcml0YWJsZVN0YXRlO1xuXG5cbi8qPHJlcGxhY2VtZW50PiovXG52YXIgdXRpbCA9IHJlcXVpcmUoJ2NvcmUtdXRpbC1pcycpO1xudXRpbC5pbmhlcml0cyA9IHJlcXVpcmUoJ2luaGVyaXRzJyk7XG4vKjwvcmVwbGFjZW1lbnQ+Ki9cblxudmFyIFN0cmVhbSA9IHJlcXVpcmUoJ3N0cmVhbScpO1xuXG51dGlsLmluaGVyaXRzKFdyaXRhYmxlLCBTdHJlYW0pO1xuXG5mdW5jdGlvbiBXcml0ZVJlcShjaHVuaywgZW5jb2RpbmcsIGNiKSB7XG4gIHRoaXMuY2h1bmsgPSBjaHVuaztcbiAgdGhpcy5lbmNvZGluZyA9IGVuY29kaW5nO1xuICB0aGlzLmNhbGxiYWNrID0gY2I7XG59XG5cbmZ1bmN0aW9uIFdyaXRhYmxlU3RhdGUob3B0aW9ucywgc3RyZWFtKSB7XG4gIHZhciBEdXBsZXggPSByZXF1aXJlKCcuL19zdHJlYW1fZHVwbGV4Jyk7XG5cbiAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG5cbiAgLy8gdGhlIHBvaW50IGF0IHdoaWNoIHdyaXRlKCkgc3RhcnRzIHJldHVybmluZyBmYWxzZVxuICAvLyBOb3RlOiAwIGlzIGEgdmFsaWQgdmFsdWUsIG1lYW5zIHRoYXQgd2UgYWx3YXlzIHJldHVybiBmYWxzZSBpZlxuICAvLyB0aGUgZW50aXJlIGJ1ZmZlciBpcyBub3QgZmx1c2hlZCBpbW1lZGlhdGVseSBvbiB3cml0ZSgpXG4gIHZhciBod20gPSBvcHRpb25zLmhpZ2hXYXRlck1hcms7XG4gIHZhciBkZWZhdWx0SHdtID0gb3B0aW9ucy5vYmplY3RNb2RlID8gMTYgOiAxNiAqIDEwMjQ7XG4gIHRoaXMuaGlnaFdhdGVyTWFyayA9IChod20gfHwgaHdtID09PSAwKSA/IGh3bSA6IGRlZmF1bHRId207XG5cbiAgLy8gb2JqZWN0IHN0cmVhbSBmbGFnIHRvIGluZGljYXRlIHdoZXRoZXIgb3Igbm90IHRoaXMgc3RyZWFtXG4gIC8vIGNvbnRhaW5zIGJ1ZmZlcnMgb3Igb2JqZWN0cy5cbiAgdGhpcy5vYmplY3RNb2RlID0gISFvcHRpb25zLm9iamVjdE1vZGU7XG5cbiAgaWYgKHN0cmVhbSBpbnN0YW5jZW9mIER1cGxleClcbiAgICB0aGlzLm9iamVjdE1vZGUgPSB0aGlzLm9iamVjdE1vZGUgfHwgISFvcHRpb25zLndyaXRhYmxlT2JqZWN0TW9kZTtcblxuICAvLyBjYXN0IHRvIGludHMuXG4gIHRoaXMuaGlnaFdhdGVyTWFyayA9IH5+dGhpcy5oaWdoV2F0ZXJNYXJrO1xuXG4gIHRoaXMubmVlZERyYWluID0gZmFsc2U7XG4gIC8vIGF0IHRoZSBzdGFydCBvZiBjYWxsaW5nIGVuZCgpXG4gIHRoaXMuZW5kaW5nID0gZmFsc2U7XG4gIC8vIHdoZW4gZW5kKCkgaGFzIGJlZW4gY2FsbGVkLCBhbmQgcmV0dXJuZWRcbiAgdGhpcy5lbmRlZCA9IGZhbHNlO1xuICAvLyB3aGVuICdmaW5pc2gnIGlzIGVtaXR0ZWRcbiAgdGhpcy5maW5pc2hlZCA9IGZhbHNlO1xuXG4gIC8vIHNob3VsZCB3ZSBkZWNvZGUgc3RyaW5ncyBpbnRvIGJ1ZmZlcnMgYmVmb3JlIHBhc3NpbmcgdG8gX3dyaXRlP1xuICAvLyB0aGlzIGlzIGhlcmUgc28gdGhhdCBzb21lIG5vZGUtY29yZSBzdHJlYW1zIGNhbiBvcHRpbWl6ZSBzdHJpbmdcbiAgLy8gaGFuZGxpbmcgYXQgYSBsb3dlciBsZXZlbC5cbiAgdmFyIG5vRGVjb2RlID0gb3B0aW9ucy5kZWNvZGVTdHJpbmdzID09PSBmYWxzZTtcbiAgdGhpcy5kZWNvZGVTdHJpbmdzID0gIW5vRGVjb2RlO1xuXG4gIC8vIENyeXB0byBpcyBraW5kIG9mIG9sZCBhbmQgY3J1c3R5LiAgSGlzdG9yaWNhbGx5LCBpdHMgZGVmYXVsdCBzdHJpbmdcbiAgLy8gZW5jb2RpbmcgaXMgJ2JpbmFyeScgc28gd2UgaGF2ZSB0byBtYWtlIHRoaXMgY29uZmlndXJhYmxlLlxuICAvLyBFdmVyeXRoaW5nIGVsc2UgaW4gdGhlIHVuaXZlcnNlIHVzZXMgJ3V0ZjgnLCB0aG91Z2guXG4gIHRoaXMuZGVmYXVsdEVuY29kaW5nID0gb3B0aW9ucy5kZWZhdWx0RW5jb2RpbmcgfHwgJ3V0ZjgnO1xuXG4gIC8vIG5vdCBhbiBhY3R1YWwgYnVmZmVyIHdlIGtlZXAgdHJhY2sgb2YsIGJ1dCBhIG1lYXN1cmVtZW50XG4gIC8vIG9mIGhvdyBtdWNoIHdlJ3JlIHdhaXRpbmcgdG8gZ2V0IHB1c2hlZCB0byBzb21lIHVuZGVybHlpbmdcbiAgLy8gc29ja2V0IG9yIGZpbGUuXG4gIHRoaXMubGVuZ3RoID0gMDtcblxuICAvLyBhIGZsYWcgdG8gc2VlIHdoZW4gd2UncmUgaW4gdGhlIG1pZGRsZSBvZiBhIHdyaXRlLlxuICB0aGlzLndyaXRpbmcgPSBmYWxzZTtcblxuICAvLyB3aGVuIHRydWUgYWxsIHdyaXRlcyB3aWxsIGJlIGJ1ZmZlcmVkIHVudGlsIC51bmNvcmsoKSBjYWxsXG4gIHRoaXMuY29ya2VkID0gMDtcblxuICAvLyBhIGZsYWcgdG8gYmUgYWJsZSB0byB0ZWxsIGlmIHRoZSBvbndyaXRlIGNiIGlzIGNhbGxlZCBpbW1lZGlhdGVseSxcbiAgLy8gb3Igb24gYSBsYXRlciB0aWNrLiAgV2Ugc2V0IHRoaXMgdG8gdHJ1ZSBhdCBmaXJzdCwgYmVjYXVzZSBhbnlcbiAgLy8gYWN0aW9ucyB0aGF0IHNob3VsZG4ndCBoYXBwZW4gdW50aWwgXCJsYXRlclwiIHNob3VsZCBnZW5lcmFsbHkgYWxzb1xuICAvLyBub3QgaGFwcGVuIGJlZm9yZSB0aGUgZmlyc3Qgd3JpdGUgY2FsbC5cbiAgdGhpcy5zeW5jID0gdHJ1ZTtcblxuICAvLyBhIGZsYWcgdG8ga25vdyBpZiB3ZSdyZSBwcm9jZXNzaW5nIHByZXZpb3VzbHkgYnVmZmVyZWQgaXRlbXMsIHdoaWNoXG4gIC8vIG1heSBjYWxsIHRoZSBfd3JpdGUoKSBjYWxsYmFjayBpbiB0aGUgc2FtZSB0aWNrLCBzbyB0aGF0IHdlIGRvbid0XG4gIC8vIGVuZCB1cCBpbiBhbiBvdmVybGFwcGVkIG9ud3JpdGUgc2l0dWF0aW9uLlxuICB0aGlzLmJ1ZmZlclByb2Nlc3NpbmcgPSBmYWxzZTtcblxuICAvLyB0aGUgY2FsbGJhY2sgdGhhdCdzIHBhc3NlZCB0byBfd3JpdGUoY2h1bmssY2IpXG4gIHRoaXMub253cml0ZSA9IGZ1bmN0aW9uKGVyKSB7XG4gICAgb253cml0ZShzdHJlYW0sIGVyKTtcbiAgfTtcblxuICAvLyB0aGUgY2FsbGJhY2sgdGhhdCB0aGUgdXNlciBzdXBwbGllcyB0byB3cml0ZShjaHVuayxlbmNvZGluZyxjYilcbiAgdGhpcy53cml0ZWNiID0gbnVsbDtcblxuICAvLyB0aGUgYW1vdW50IHRoYXQgaXMgYmVpbmcgd3JpdHRlbiB3aGVuIF93cml0ZSBpcyBjYWxsZWQuXG4gIHRoaXMud3JpdGVsZW4gPSAwO1xuXG4gIHRoaXMuYnVmZmVyID0gW107XG5cbiAgLy8gbnVtYmVyIG9mIHBlbmRpbmcgdXNlci1zdXBwbGllZCB3cml0ZSBjYWxsYmFja3NcbiAgLy8gdGhpcyBtdXN0IGJlIDAgYmVmb3JlICdmaW5pc2gnIGNhbiBiZSBlbWl0dGVkXG4gIHRoaXMucGVuZGluZ2NiID0gMDtcblxuICAvLyBlbWl0IHByZWZpbmlzaCBpZiB0aGUgb25seSB0aGluZyB3ZSdyZSB3YWl0aW5nIGZvciBpcyBfd3JpdGUgY2JzXG4gIC8vIFRoaXMgaXMgcmVsZXZhbnQgZm9yIHN5bmNocm9ub3VzIFRyYW5zZm9ybSBzdHJlYW1zXG4gIHRoaXMucHJlZmluaXNoZWQgPSBmYWxzZTtcblxuICAvLyBUcnVlIGlmIHRoZSBlcnJvciB3YXMgYWxyZWFkeSBlbWl0dGVkIGFuZCBzaG91bGQgbm90IGJlIHRocm93biBhZ2FpblxuICB0aGlzLmVycm9yRW1pdHRlZCA9IGZhbHNlO1xufVxuXG5mdW5jdGlvbiBXcml0YWJsZShvcHRpb25zKSB7XG4gIHZhciBEdXBsZXggPSByZXF1aXJlKCcuL19zdHJlYW1fZHVwbGV4Jyk7XG5cbiAgLy8gV3JpdGFibGUgY3RvciBpcyBhcHBsaWVkIHRvIER1cGxleGVzLCB0aG91Z2ggdGhleSdyZSBub3RcbiAgLy8gaW5zdGFuY2VvZiBXcml0YWJsZSwgdGhleSdyZSBpbnN0YW5jZW9mIFJlYWRhYmxlLlxuICBpZiAoISh0aGlzIGluc3RhbmNlb2YgV3JpdGFibGUpICYmICEodGhpcyBpbnN0YW5jZW9mIER1cGxleCkpXG4gICAgcmV0dXJuIG5ldyBXcml0YWJsZShvcHRpb25zKTtcblxuICB0aGlzLl93cml0YWJsZVN0YXRlID0gbmV3IFdyaXRhYmxlU3RhdGUob3B0aW9ucywgdGhpcyk7XG5cbiAgLy8gbGVnYWN5LlxuICB0aGlzLndyaXRhYmxlID0gdHJ1ZTtcblxuICBTdHJlYW0uY2FsbCh0aGlzKTtcbn1cblxuLy8gT3RoZXJ3aXNlIHBlb3BsZSBjYW4gcGlwZSBXcml0YWJsZSBzdHJlYW1zLCB3aGljaCBpcyBqdXN0IHdyb25nLlxuV3JpdGFibGUucHJvdG90eXBlLnBpcGUgPSBmdW5jdGlvbigpIHtcbiAgdGhpcy5lbWl0KCdlcnJvcicsIG5ldyBFcnJvcignQ2Fubm90IHBpcGUuIE5vdCByZWFkYWJsZS4nKSk7XG59O1xuXG5cbmZ1bmN0aW9uIHdyaXRlQWZ0ZXJFbmQoc3RyZWFtLCBzdGF0ZSwgY2IpIHtcbiAgdmFyIGVyID0gbmV3IEVycm9yKCd3cml0ZSBhZnRlciBlbmQnKTtcbiAgLy8gVE9ETzogZGVmZXIgZXJyb3IgZXZlbnRzIGNvbnNpc3RlbnRseSBldmVyeXdoZXJlLCBub3QganVzdCB0aGUgY2JcbiAgc3RyZWFtLmVtaXQoJ2Vycm9yJywgZXIpO1xuICBwcm9jZXNzLm5leHRUaWNrKGZ1bmN0aW9uKCkge1xuICAgIGNiKGVyKTtcbiAgfSk7XG59XG5cbi8vIElmIHdlIGdldCBzb21ldGhpbmcgdGhhdCBpcyBub3QgYSBidWZmZXIsIHN0cmluZywgbnVsbCwgb3IgdW5kZWZpbmVkLFxuLy8gYW5kIHdlJ3JlIG5vdCBpbiBvYmplY3RNb2RlLCB0aGVuIHRoYXQncyBhbiBlcnJvci5cbi8vIE90aGVyd2lzZSBzdHJlYW0gY2h1bmtzIGFyZSBhbGwgY29uc2lkZXJlZCB0byBiZSBvZiBsZW5ndGg9MSwgYW5kIHRoZVxuLy8gd2F0ZXJtYXJrcyBkZXRlcm1pbmUgaG93IG1hbnkgb2JqZWN0cyB0byBrZWVwIGluIHRoZSBidWZmZXIsIHJhdGhlciB0aGFuXG4vLyBob3cgbWFueSBieXRlcyBvciBjaGFyYWN0ZXJzLlxuZnVuY3Rpb24gdmFsaWRDaHVuayhzdHJlYW0sIHN0YXRlLCBjaHVuaywgY2IpIHtcbiAgdmFyIHZhbGlkID0gdHJ1ZTtcbiAgaWYgKCF1dGlsLmlzQnVmZmVyKGNodW5rKSAmJlxuICAgICAgIXV0aWwuaXNTdHJpbmcoY2h1bmspICYmXG4gICAgICAhdXRpbC5pc051bGxPclVuZGVmaW5lZChjaHVuaykgJiZcbiAgICAgICFzdGF0ZS5vYmplY3RNb2RlKSB7XG4gICAgdmFyIGVyID0gbmV3IFR5cGVFcnJvcignSW52YWxpZCBub24tc3RyaW5nL2J1ZmZlciBjaHVuaycpO1xuICAgIHN0cmVhbS5lbWl0KCdlcnJvcicsIGVyKTtcbiAgICBwcm9jZXNzLm5leHRUaWNrKGZ1bmN0aW9uKCkge1xuICAgICAgY2IoZXIpO1xuICAgIH0pO1xuICAgIHZhbGlkID0gZmFsc2U7XG4gIH1cbiAgcmV0dXJuIHZhbGlkO1xufVxuXG5Xcml0YWJsZS5wcm90b3R5cGUud3JpdGUgPSBmdW5jdGlvbihjaHVuaywgZW5jb2RpbmcsIGNiKSB7XG4gIHZhciBzdGF0ZSA9IHRoaXMuX3dyaXRhYmxlU3RhdGU7XG4gIHZhciByZXQgPSBmYWxzZTtcblxuICBpZiAodXRpbC5pc0Z1bmN0aW9uKGVuY29kaW5nKSkge1xuICAgIGNiID0gZW5jb2Rpbmc7XG4gICAgZW5jb2RpbmcgPSBudWxsO1xuICB9XG5cbiAgaWYgKHV0aWwuaXNCdWZmZXIoY2h1bmspKVxuICAgIGVuY29kaW5nID0gJ2J1ZmZlcic7XG4gIGVsc2UgaWYgKCFlbmNvZGluZylcbiAgICBlbmNvZGluZyA9IHN0YXRlLmRlZmF1bHRFbmNvZGluZztcblxuICBpZiAoIXV0aWwuaXNGdW5jdGlvbihjYikpXG4gICAgY2IgPSBmdW5jdGlvbigpIHt9O1xuXG4gIGlmIChzdGF0ZS5lbmRlZClcbiAgICB3cml0ZUFmdGVyRW5kKHRoaXMsIHN0YXRlLCBjYik7XG4gIGVsc2UgaWYgKHZhbGlkQ2h1bmsodGhpcywgc3RhdGUsIGNodW5rLCBjYikpIHtcbiAgICBzdGF0ZS5wZW5kaW5nY2IrKztcbiAgICByZXQgPSB3cml0ZU9yQnVmZmVyKHRoaXMsIHN0YXRlLCBjaHVuaywgZW5jb2RpbmcsIGNiKTtcbiAgfVxuXG4gIHJldHVybiByZXQ7XG59O1xuXG5Xcml0YWJsZS5wcm90b3R5cGUuY29yayA9IGZ1bmN0aW9uKCkge1xuICB2YXIgc3RhdGUgPSB0aGlzLl93cml0YWJsZVN0YXRlO1xuXG4gIHN0YXRlLmNvcmtlZCsrO1xufTtcblxuV3JpdGFibGUucHJvdG90eXBlLnVuY29yayA9IGZ1bmN0aW9uKCkge1xuICB2YXIgc3RhdGUgPSB0aGlzLl93cml0YWJsZVN0YXRlO1xuXG4gIGlmIChzdGF0ZS5jb3JrZWQpIHtcbiAgICBzdGF0ZS5jb3JrZWQtLTtcblxuICAgIGlmICghc3RhdGUud3JpdGluZyAmJlxuICAgICAgICAhc3RhdGUuY29ya2VkICYmXG4gICAgICAgICFzdGF0ZS5maW5pc2hlZCAmJlxuICAgICAgICAhc3RhdGUuYnVmZmVyUHJvY2Vzc2luZyAmJlxuICAgICAgICBzdGF0ZS5idWZmZXIubGVuZ3RoKVxuICAgICAgY2xlYXJCdWZmZXIodGhpcywgc3RhdGUpO1xuICB9XG59O1xuXG5mdW5jdGlvbiBkZWNvZGVDaHVuayhzdGF0ZSwgY2h1bmssIGVuY29kaW5nKSB7XG4gIGlmICghc3RhdGUub2JqZWN0TW9kZSAmJlxuICAgICAgc3RhdGUuZGVjb2RlU3RyaW5ncyAhPT0gZmFsc2UgJiZcbiAgICAgIHV0aWwuaXNTdHJpbmcoY2h1bmspKSB7XG4gICAgY2h1bmsgPSBuZXcgQnVmZmVyKGNodW5rLCBlbmNvZGluZyk7XG4gIH1cbiAgcmV0dXJuIGNodW5rO1xufVxuXG4vLyBpZiB3ZSdyZSBhbHJlYWR5IHdyaXRpbmcgc29tZXRoaW5nLCB0aGVuIGp1c3QgcHV0IHRoaXNcbi8vIGluIHRoZSBxdWV1ZSwgYW5kIHdhaXQgb3VyIHR1cm4uICBPdGhlcndpc2UsIGNhbGwgX3dyaXRlXG4vLyBJZiB3ZSByZXR1cm4gZmFsc2UsIHRoZW4gd2UgbmVlZCBhIGRyYWluIGV2ZW50LCBzbyBzZXQgdGhhdCBmbGFnLlxuZnVuY3Rpb24gd3JpdGVPckJ1ZmZlcihzdHJlYW0sIHN0YXRlLCBjaHVuaywgZW5jb2RpbmcsIGNiKSB7XG4gIGNodW5rID0gZGVjb2RlQ2h1bmsoc3RhdGUsIGNodW5rLCBlbmNvZGluZyk7XG4gIGlmICh1dGlsLmlzQnVmZmVyKGNodW5rKSlcbiAgICBlbmNvZGluZyA9ICdidWZmZXInO1xuICB2YXIgbGVuID0gc3RhdGUub2JqZWN0TW9kZSA/IDEgOiBjaHVuay5sZW5ndGg7XG5cbiAgc3RhdGUubGVuZ3RoICs9IGxlbjtcblxuICB2YXIgcmV0ID0gc3RhdGUubGVuZ3RoIDwgc3RhdGUuaGlnaFdhdGVyTWFyaztcbiAgLy8gd2UgbXVzdCBlbnN1cmUgdGhhdCBwcmV2aW91cyBuZWVkRHJhaW4gd2lsbCBub3QgYmUgcmVzZXQgdG8gZmFsc2UuXG4gIGlmICghcmV0KVxuICAgIHN0YXRlLm5lZWREcmFpbiA9IHRydWU7XG5cbiAgaWYgKHN0YXRlLndyaXRpbmcgfHwgc3RhdGUuY29ya2VkKVxuICAgIHN0YXRlLmJ1ZmZlci5wdXNoKG5ldyBXcml0ZVJlcShjaHVuaywgZW5jb2RpbmcsIGNiKSk7XG4gIGVsc2VcbiAgICBkb1dyaXRlKHN0cmVhbSwgc3RhdGUsIGZhbHNlLCBsZW4sIGNodW5rLCBlbmNvZGluZywgY2IpO1xuXG4gIHJldHVybiByZXQ7XG59XG5cbmZ1bmN0aW9uIGRvV3JpdGUoc3RyZWFtLCBzdGF0ZSwgd3JpdGV2LCBsZW4sIGNodW5rLCBlbmNvZGluZywgY2IpIHtcbiAgc3RhdGUud3JpdGVsZW4gPSBsZW47XG4gIHN0YXRlLndyaXRlY2IgPSBjYjtcbiAgc3RhdGUud3JpdGluZyA9IHRydWU7XG4gIHN0YXRlLnN5bmMgPSB0cnVlO1xuICBpZiAod3JpdGV2KVxuICAgIHN0cmVhbS5fd3JpdGV2KGNodW5rLCBzdGF0ZS5vbndyaXRlKTtcbiAgZWxzZVxuICAgIHN0cmVhbS5fd3JpdGUoY2h1bmssIGVuY29kaW5nLCBzdGF0ZS5vbndyaXRlKTtcbiAgc3RhdGUuc3luYyA9IGZhbHNlO1xufVxuXG5mdW5jdGlvbiBvbndyaXRlRXJyb3Ioc3RyZWFtLCBzdGF0ZSwgc3luYywgZXIsIGNiKSB7XG4gIGlmIChzeW5jKVxuICAgIHByb2Nlc3MubmV4dFRpY2soZnVuY3Rpb24oKSB7XG4gICAgICBzdGF0ZS5wZW5kaW5nY2ItLTtcbiAgICAgIGNiKGVyKTtcbiAgICB9KTtcbiAgZWxzZSB7XG4gICAgc3RhdGUucGVuZGluZ2NiLS07XG4gICAgY2IoZXIpO1xuICB9XG5cbiAgc3RyZWFtLl93cml0YWJsZVN0YXRlLmVycm9yRW1pdHRlZCA9IHRydWU7XG4gIHN0cmVhbS5lbWl0KCdlcnJvcicsIGVyKTtcbn1cblxuZnVuY3Rpb24gb253cml0ZVN0YXRlVXBkYXRlKHN0YXRlKSB7XG4gIHN0YXRlLndyaXRpbmcgPSBmYWxzZTtcbiAgc3RhdGUud3JpdGVjYiA9IG51bGw7XG4gIHN0YXRlLmxlbmd0aCAtPSBzdGF0ZS53cml0ZWxlbjtcbiAgc3RhdGUud3JpdGVsZW4gPSAwO1xufVxuXG5mdW5jdGlvbiBvbndyaXRlKHN0cmVhbSwgZXIpIHtcbiAgdmFyIHN0YXRlID0gc3RyZWFtLl93cml0YWJsZVN0YXRlO1xuICB2YXIgc3luYyA9IHN0YXRlLnN5bmM7XG4gIHZhciBjYiA9IHN0YXRlLndyaXRlY2I7XG5cbiAgb253cml0ZVN0YXRlVXBkYXRlKHN0YXRlKTtcblxuICBpZiAoZXIpXG4gICAgb253cml0ZUVycm9yKHN0cmVhbSwgc3RhdGUsIHN5bmMsIGVyLCBjYik7XG4gIGVsc2Uge1xuICAgIC8vIENoZWNrIGlmIHdlJ3JlIGFjdHVhbGx5IHJlYWR5IHRvIGZpbmlzaCwgYnV0IGRvbid0IGVtaXQgeWV0XG4gICAgdmFyIGZpbmlzaGVkID0gbmVlZEZpbmlzaChzdHJlYW0sIHN0YXRlKTtcblxuICAgIGlmICghZmluaXNoZWQgJiZcbiAgICAgICAgIXN0YXRlLmNvcmtlZCAmJlxuICAgICAgICAhc3RhdGUuYnVmZmVyUHJvY2Vzc2luZyAmJlxuICAgICAgICBzdGF0ZS5idWZmZXIubGVuZ3RoKSB7XG4gICAgICBjbGVhckJ1ZmZlcihzdHJlYW0sIHN0YXRlKTtcbiAgICB9XG5cbiAgICBpZiAoc3luYykge1xuICAgICAgcHJvY2Vzcy5uZXh0VGljayhmdW5jdGlvbigpIHtcbiAgICAgICAgYWZ0ZXJXcml0ZShzdHJlYW0sIHN0YXRlLCBmaW5pc2hlZCwgY2IpO1xuICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGFmdGVyV3JpdGUoc3RyZWFtLCBzdGF0ZSwgZmluaXNoZWQsIGNiKTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gYWZ0ZXJXcml0ZShzdHJlYW0sIHN0YXRlLCBmaW5pc2hlZCwgY2IpIHtcbiAgaWYgKCFmaW5pc2hlZClcbiAgICBvbndyaXRlRHJhaW4oc3RyZWFtLCBzdGF0ZSk7XG4gIHN0YXRlLnBlbmRpbmdjYi0tO1xuICBjYigpO1xuICBmaW5pc2hNYXliZShzdHJlYW0sIHN0YXRlKTtcbn1cblxuLy8gTXVzdCBmb3JjZSBjYWxsYmFjayB0byBiZSBjYWxsZWQgb24gbmV4dFRpY2ssIHNvIHRoYXQgd2UgZG9uJ3Rcbi8vIGVtaXQgJ2RyYWluJyBiZWZvcmUgdGhlIHdyaXRlKCkgY29uc3VtZXIgZ2V0cyB0aGUgJ2ZhbHNlJyByZXR1cm5cbi8vIHZhbHVlLCBhbmQgaGFzIGEgY2hhbmNlIHRvIGF0dGFjaCBhICdkcmFpbicgbGlzdGVuZXIuXG5mdW5jdGlvbiBvbndyaXRlRHJhaW4oc3RyZWFtLCBzdGF0ZSkge1xuICBpZiAoc3RhdGUubGVuZ3RoID09PSAwICYmIHN0YXRlLm5lZWREcmFpbikge1xuICAgIHN0YXRlLm5lZWREcmFpbiA9IGZhbHNlO1xuICAgIHN0cmVhbS5lbWl0KCdkcmFpbicpO1xuICB9XG59XG5cblxuLy8gaWYgdGhlcmUncyBzb21ldGhpbmcgaW4gdGhlIGJ1ZmZlciB3YWl0aW5nLCB0aGVuIHByb2Nlc3MgaXRcbmZ1bmN0aW9uIGNsZWFyQnVmZmVyKHN0cmVhbSwgc3RhdGUpIHtcbiAgc3RhdGUuYnVmZmVyUHJvY2Vzc2luZyA9IHRydWU7XG5cbiAgaWYgKHN0cmVhbS5fd3JpdGV2ICYmIHN0YXRlLmJ1ZmZlci5sZW5ndGggPiAxKSB7XG4gICAgLy8gRmFzdCBjYXNlLCB3cml0ZSBldmVyeXRoaW5nIHVzaW5nIF93cml0ZXYoKVxuICAgIHZhciBjYnMgPSBbXTtcbiAgICBmb3IgKHZhciBjID0gMDsgYyA8IHN0YXRlLmJ1ZmZlci5sZW5ndGg7IGMrKylcbiAgICAgIGNicy5wdXNoKHN0YXRlLmJ1ZmZlcltjXS5jYWxsYmFjayk7XG5cbiAgICAvLyBjb3VudCB0aGUgb25lIHdlIGFyZSBhZGRpbmcsIGFzIHdlbGwuXG4gICAgLy8gVE9ETyhpc2FhY3MpIGNsZWFuIHRoaXMgdXBcbiAgICBzdGF0ZS5wZW5kaW5nY2IrKztcbiAgICBkb1dyaXRlKHN0cmVhbSwgc3RhdGUsIHRydWUsIHN0YXRlLmxlbmd0aCwgc3RhdGUuYnVmZmVyLCAnJywgZnVuY3Rpb24oZXJyKSB7XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGNicy5sZW5ndGg7IGkrKykge1xuICAgICAgICBzdGF0ZS5wZW5kaW5nY2ItLTtcbiAgICAgICAgY2JzW2ldKGVycik7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBDbGVhciBidWZmZXJcbiAgICBzdGF0ZS5idWZmZXIgPSBbXTtcbiAgfSBlbHNlIHtcbiAgICAvLyBTbG93IGNhc2UsIHdyaXRlIGNodW5rcyBvbmUtYnktb25lXG4gICAgZm9yICh2YXIgYyA9IDA7IGMgPCBzdGF0ZS5idWZmZXIubGVuZ3RoOyBjKyspIHtcbiAgICAgIHZhciBlbnRyeSA9IHN0YXRlLmJ1ZmZlcltjXTtcbiAgICAgIHZhciBjaHVuayA9IGVudHJ5LmNodW5rO1xuICAgICAgdmFyIGVuY29kaW5nID0gZW50cnkuZW5jb2Rpbmc7XG4gICAgICB2YXIgY2IgPSBlbnRyeS5jYWxsYmFjaztcbiAgICAgIHZhciBsZW4gPSBzdGF0ZS5vYmplY3RNb2RlID8gMSA6IGNodW5rLmxlbmd0aDtcblxuICAgICAgZG9Xcml0ZShzdHJlYW0sIHN0YXRlLCBmYWxzZSwgbGVuLCBjaHVuaywgZW5jb2RpbmcsIGNiKTtcblxuICAgICAgLy8gaWYgd2UgZGlkbid0IGNhbGwgdGhlIG9ud3JpdGUgaW1tZWRpYXRlbHksIHRoZW5cbiAgICAgIC8vIGl0IG1lYW5zIHRoYXQgd2UgbmVlZCB0byB3YWl0IHVudGlsIGl0IGRvZXMuXG4gICAgICAvLyBhbHNvLCB0aGF0IG1lYW5zIHRoYXQgdGhlIGNodW5rIGFuZCBjYiBhcmUgY3VycmVudGx5XG4gICAgICAvLyBiZWluZyBwcm9jZXNzZWQsIHNvIG1vdmUgdGhlIGJ1ZmZlciBjb3VudGVyIHBhc3QgdGhlbS5cbiAgICAgIGlmIChzdGF0ZS53cml0aW5nKSB7XG4gICAgICAgIGMrKztcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGMgPCBzdGF0ZS5idWZmZXIubGVuZ3RoKVxuICAgICAgc3RhdGUuYnVmZmVyID0gc3RhdGUuYnVmZmVyLnNsaWNlKGMpO1xuICAgIGVsc2VcbiAgICAgIHN0YXRlLmJ1ZmZlci5sZW5ndGggPSAwO1xuICB9XG5cbiAgc3RhdGUuYnVmZmVyUHJvY2Vzc2luZyA9IGZhbHNlO1xufVxuXG5Xcml0YWJsZS5wcm90b3R5cGUuX3dyaXRlID0gZnVuY3Rpb24oY2h1bmssIGVuY29kaW5nLCBjYikge1xuICBjYihuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpKTtcblxufTtcblxuV3JpdGFibGUucHJvdG90eXBlLl93cml0ZXYgPSBudWxsO1xuXG5Xcml0YWJsZS5wcm90b3R5cGUuZW5kID0gZnVuY3Rpb24oY2h1bmssIGVuY29kaW5nLCBjYikge1xuICB2YXIgc3RhdGUgPSB0aGlzLl93cml0YWJsZVN0YXRlO1xuXG4gIGlmICh1dGlsLmlzRnVuY3Rpb24oY2h1bmspKSB7XG4gICAgY2IgPSBjaHVuaztcbiAgICBjaHVuayA9IG51bGw7XG4gICAgZW5jb2RpbmcgPSBudWxsO1xuICB9IGVsc2UgaWYgKHV0aWwuaXNGdW5jdGlvbihlbmNvZGluZykpIHtcbiAgICBjYiA9IGVuY29kaW5nO1xuICAgIGVuY29kaW5nID0gbnVsbDtcbiAgfVxuXG4gIGlmICghdXRpbC5pc051bGxPclVuZGVmaW5lZChjaHVuaykpXG4gICAgdGhpcy53cml0ZShjaHVuaywgZW5jb2RpbmcpO1xuXG4gIC8vIC5lbmQoKSBmdWxseSB1bmNvcmtzXG4gIGlmIChzdGF0ZS5jb3JrZWQpIHtcbiAgICBzdGF0ZS5jb3JrZWQgPSAxO1xuICAgIHRoaXMudW5jb3JrKCk7XG4gIH1cblxuICAvLyBpZ25vcmUgdW5uZWNlc3NhcnkgZW5kKCkgY2FsbHMuXG4gIGlmICghc3RhdGUuZW5kaW5nICYmICFzdGF0ZS5maW5pc2hlZClcbiAgICBlbmRXcml0YWJsZSh0aGlzLCBzdGF0ZSwgY2IpO1xufTtcblxuXG5mdW5jdGlvbiBuZWVkRmluaXNoKHN0cmVhbSwgc3RhdGUpIHtcbiAgcmV0dXJuIChzdGF0ZS5lbmRpbmcgJiZcbiAgICAgICAgICBzdGF0ZS5sZW5ndGggPT09IDAgJiZcbiAgICAgICAgICAhc3RhdGUuZmluaXNoZWQgJiZcbiAgICAgICAgICAhc3RhdGUud3JpdGluZyk7XG59XG5cbmZ1bmN0aW9uIHByZWZpbmlzaChzdHJlYW0sIHN0YXRlKSB7XG4gIGlmICghc3RhdGUucHJlZmluaXNoZWQpIHtcbiAgICBzdGF0ZS5wcmVmaW5pc2hlZCA9IHRydWU7XG4gICAgc3RyZWFtLmVtaXQoJ3ByZWZpbmlzaCcpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGZpbmlzaE1heWJlKHN0cmVhbSwgc3RhdGUpIHtcbiAgdmFyIG5lZWQgPSBuZWVkRmluaXNoKHN0cmVhbSwgc3RhdGUpO1xuICBpZiAobmVlZCkge1xuICAgIGlmIChzdGF0ZS5wZW5kaW5nY2IgPT09IDApIHtcbiAgICAgIHByZWZpbmlzaChzdHJlYW0sIHN0YXRlKTtcbiAgICAgIHN0YXRlLmZpbmlzaGVkID0gdHJ1ZTtcbiAgICAgIHN0cmVhbS5lbWl0KCdmaW5pc2gnKTtcbiAgICB9IGVsc2VcbiAgICAgIHByZWZpbmlzaChzdHJlYW0sIHN0YXRlKTtcbiAgfVxuICByZXR1cm4gbmVlZDtcbn1cblxuZnVuY3Rpb24gZW5kV3JpdGFibGUoc3RyZWFtLCBzdGF0ZSwgY2IpIHtcbiAgc3RhdGUuZW5kaW5nID0gdHJ1ZTtcbiAgZmluaXNoTWF5YmUoc3RyZWFtLCBzdGF0ZSk7XG4gIGlmIChjYikge1xuICAgIGlmIChzdGF0ZS5maW5pc2hlZClcbiAgICAgIHByb2Nlc3MubmV4dFRpY2soY2IpO1xuICAgIGVsc2VcbiAgICAgIHN0cmVhbS5vbmNlKCdmaW5pc2gnLCBjYik7XG4gIH1cbiAgc3RhdGUuZW5kZWQgPSB0cnVlO1xufVxuIiwiLy8gQ29weXJpZ2h0IEpveWVudCwgSW5jLiBhbmQgb3RoZXIgTm9kZSBjb250cmlidXRvcnMuXG4vL1xuLy8gUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGFcbi8vIGNvcHkgb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGVcbi8vIFwiU29mdHdhcmVcIiksIHRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZ1xuLy8gd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLFxuLy8gZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdFxuLy8gcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlXG4vLyBmb2xsb3dpbmcgY29uZGl0aW9uczpcbi8vXG4vLyBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZFxuLy8gaW4gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4vL1xuLy8gVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTU1xuLy8gT1IgSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRlxuLy8gTUVSQ0hBTlRBQklMSVRZLCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTlxuLy8gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sXG4vLyBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1Jcbi8vIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEVcbi8vIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXG5cbi8vIE5PVEU6IFRoZXNlIHR5cGUgY2hlY2tpbmcgZnVuY3Rpb25zIGludGVudGlvbmFsbHkgZG9uJ3QgdXNlIGBpbnN0YW5jZW9mYFxuLy8gYmVjYXVzZSBpdCBpcyBmcmFnaWxlIGFuZCBjYW4gYmUgZWFzaWx5IGZha2VkIHdpdGggYE9iamVjdC5jcmVhdGUoKWAuXG5mdW5jdGlvbiBpc0FycmF5KGFyKSB7XG4gIHJldHVybiBBcnJheS5pc0FycmF5KGFyKTtcbn1cbmV4cG9ydHMuaXNBcnJheSA9IGlzQXJyYXk7XG5cbmZ1bmN0aW9uIGlzQm9vbGVhbihhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdib29sZWFuJztcbn1cbmV4cG9ydHMuaXNCb29sZWFuID0gaXNCb29sZWFuO1xuXG5mdW5jdGlvbiBpc051bGwoYXJnKSB7XG4gIHJldHVybiBhcmcgPT09IG51bGw7XG59XG5leHBvcnRzLmlzTnVsbCA9IGlzTnVsbDtcblxuZnVuY3Rpb24gaXNOdWxsT3JVbmRlZmluZWQoYXJnKSB7XG4gIHJldHVybiBhcmcgPT0gbnVsbDtcbn1cbmV4cG9ydHMuaXNOdWxsT3JVbmRlZmluZWQgPSBpc051bGxPclVuZGVmaW5lZDtcblxuZnVuY3Rpb24gaXNOdW1iZXIoYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnbnVtYmVyJztcbn1cbmV4cG9ydHMuaXNOdW1iZXIgPSBpc051bWJlcjtcblxuZnVuY3Rpb24gaXNTdHJpbmcoYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnc3RyaW5nJztcbn1cbmV4cG9ydHMuaXNTdHJpbmcgPSBpc1N0cmluZztcblxuZnVuY3Rpb24gaXNTeW1ib2woYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnc3ltYm9sJztcbn1cbmV4cG9ydHMuaXNTeW1ib2wgPSBpc1N5bWJvbDtcblxuZnVuY3Rpb24gaXNVbmRlZmluZWQoYXJnKSB7XG4gIHJldHVybiBhcmcgPT09IHZvaWQgMDtcbn1cbmV4cG9ydHMuaXNVbmRlZmluZWQgPSBpc1VuZGVmaW5lZDtcblxuZnVuY3Rpb24gaXNSZWdFeHAocmUpIHtcbiAgcmV0dXJuIGlzT2JqZWN0KHJlKSAmJiBvYmplY3RUb1N0cmluZyhyZSkgPT09ICdbb2JqZWN0IFJlZ0V4cF0nO1xufVxuZXhwb3J0cy5pc1JlZ0V4cCA9IGlzUmVnRXhwO1xuXG5mdW5jdGlvbiBpc09iamVjdChhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdvYmplY3QnICYmIGFyZyAhPT0gbnVsbDtcbn1cbmV4cG9ydHMuaXNPYmplY3QgPSBpc09iamVjdDtcblxuZnVuY3Rpb24gaXNEYXRlKGQpIHtcbiAgcmV0dXJuIGlzT2JqZWN0KGQpICYmIG9iamVjdFRvU3RyaW5nKGQpID09PSAnW29iamVjdCBEYXRlXSc7XG59XG5leHBvcnRzLmlzRGF0ZSA9IGlzRGF0ZTtcblxuZnVuY3Rpb24gaXNFcnJvcihlKSB7XG4gIHJldHVybiBpc09iamVjdChlKSAmJlxuICAgICAgKG9iamVjdFRvU3RyaW5nKGUpID09PSAnW29iamVjdCBFcnJvcl0nIHx8IGUgaW5zdGFuY2VvZiBFcnJvcik7XG59XG5leHBvcnRzLmlzRXJyb3IgPSBpc0Vycm9yO1xuXG5mdW5jdGlvbiBpc0Z1bmN0aW9uKGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ2Z1bmN0aW9uJztcbn1cbmV4cG9ydHMuaXNGdW5jdGlvbiA9IGlzRnVuY3Rpb247XG5cbmZ1bmN0aW9uIGlzUHJpbWl0aXZlKGFyZykge1xuICByZXR1cm4gYXJnID09PSBudWxsIHx8XG4gICAgICAgICB0eXBlb2YgYXJnID09PSAnYm9vbGVhbicgfHxcbiAgICAgICAgIHR5cGVvZiBhcmcgPT09ICdudW1iZXInIHx8XG4gICAgICAgICB0eXBlb2YgYXJnID09PSAnc3RyaW5nJyB8fFxuICAgICAgICAgdHlwZW9mIGFyZyA9PT0gJ3N5bWJvbCcgfHwgIC8vIEVTNiBzeW1ib2xcbiAgICAgICAgIHR5cGVvZiBhcmcgPT09ICd1bmRlZmluZWQnO1xufVxuZXhwb3J0cy5pc1ByaW1pdGl2ZSA9IGlzUHJpbWl0aXZlO1xuXG5mdW5jdGlvbiBpc0J1ZmZlcihhcmcpIHtcbiAgcmV0dXJuIEJ1ZmZlci5pc0J1ZmZlcihhcmcpO1xufVxuZXhwb3J0cy5pc0J1ZmZlciA9IGlzQnVmZmVyO1xuXG5mdW5jdGlvbiBvYmplY3RUb1N0cmluZyhvKSB7XG4gIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwobyk7XG59IiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKFwiLi9saWIvX3N0cmVhbV9wYXNzdGhyb3VnaC5qc1wiKVxuIiwiZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gcmVxdWlyZSgnLi9saWIvX3N0cmVhbV9yZWFkYWJsZS5qcycpO1xuZXhwb3J0cy5TdHJlYW0gPSByZXF1aXJlKCdzdHJlYW0nKTtcbmV4cG9ydHMuUmVhZGFibGUgPSBleHBvcnRzO1xuZXhwb3J0cy5Xcml0YWJsZSA9IHJlcXVpcmUoJy4vbGliL19zdHJlYW1fd3JpdGFibGUuanMnKTtcbmV4cG9ydHMuRHVwbGV4ID0gcmVxdWlyZSgnLi9saWIvX3N0cmVhbV9kdXBsZXguanMnKTtcbmV4cG9ydHMuVHJhbnNmb3JtID0gcmVxdWlyZSgnLi9saWIvX3N0cmVhbV90cmFuc2Zvcm0uanMnKTtcbmV4cG9ydHMuUGFzc1Rocm91Z2ggPSByZXF1aXJlKCcuL2xpYi9fc3RyZWFtX3Bhc3N0aHJvdWdoLmpzJyk7XG4iLCJtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoXCIuL2xpYi9fc3RyZWFtX3RyYW5zZm9ybS5qc1wiKVxuIiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKFwiLi9saWIvX3N0cmVhbV93cml0YWJsZS5qc1wiKVxuIiwiLy8gQ29weXJpZ2h0IEpveWVudCwgSW5jLiBhbmQgb3RoZXIgTm9kZSBjb250cmlidXRvcnMuXG4vL1xuLy8gUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGFcbi8vIGNvcHkgb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGVcbi8vIFwiU29mdHdhcmVcIiksIHRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZ1xuLy8gd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLFxuLy8gZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdFxuLy8gcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlXG4vLyBmb2xsb3dpbmcgY29uZGl0aW9uczpcbi8vXG4vLyBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZFxuLy8gaW4gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4vL1xuLy8gVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTU1xuLy8gT1IgSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRlxuLy8gTUVSQ0hBTlRBQklMSVRZLCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTlxuLy8gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sXG4vLyBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1Jcbi8vIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEVcbi8vIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXG5cbm1vZHVsZS5leHBvcnRzID0gU3RyZWFtO1xuXG52YXIgRUUgPSByZXF1aXJlKCdldmVudHMnKS5FdmVudEVtaXR0ZXI7XG52YXIgaW5oZXJpdHMgPSByZXF1aXJlKCdpbmhlcml0cycpO1xuXG5pbmhlcml0cyhTdHJlYW0sIEVFKTtcblN0cmVhbS5SZWFkYWJsZSA9IHJlcXVpcmUoJ3JlYWRhYmxlLXN0cmVhbS9yZWFkYWJsZS5qcycpO1xuU3RyZWFtLldyaXRhYmxlID0gcmVxdWlyZSgncmVhZGFibGUtc3RyZWFtL3dyaXRhYmxlLmpzJyk7XG5TdHJlYW0uRHVwbGV4ID0gcmVxdWlyZSgncmVhZGFibGUtc3RyZWFtL2R1cGxleC5qcycpO1xuU3RyZWFtLlRyYW5zZm9ybSA9IHJlcXVpcmUoJ3JlYWRhYmxlLXN0cmVhbS90cmFuc2Zvcm0uanMnKTtcblN0cmVhbS5QYXNzVGhyb3VnaCA9IHJlcXVpcmUoJ3JlYWRhYmxlLXN0cmVhbS9wYXNzdGhyb3VnaC5qcycpO1xuXG4vLyBCYWNrd2FyZHMtY29tcGF0IHdpdGggbm9kZSAwLjQueFxuU3RyZWFtLlN0cmVhbSA9IFN0cmVhbTtcblxuXG5cbi8vIG9sZC1zdHlsZSBzdHJlYW1zLiAgTm90ZSB0aGF0IHRoZSBwaXBlIG1ldGhvZCAodGhlIG9ubHkgcmVsZXZhbnRcbi8vIHBhcnQgb2YgdGhpcyBjbGFzcykgaXMgb3ZlcnJpZGRlbiBpbiB0aGUgUmVhZGFibGUgY2xhc3MuXG5cbmZ1bmN0aW9uIFN0cmVhbSgpIHtcbiAgRUUuY2FsbCh0aGlzKTtcbn1cblxuU3RyZWFtLnByb3RvdHlwZS5waXBlID0gZnVuY3Rpb24oZGVzdCwgb3B0aW9ucykge1xuICB2YXIgc291cmNlID0gdGhpcztcblxuICBmdW5jdGlvbiBvbmRhdGEoY2h1bmspIHtcbiAgICBpZiAoZGVzdC53cml0YWJsZSkge1xuICAgICAgaWYgKGZhbHNlID09PSBkZXN0LndyaXRlKGNodW5rKSAmJiBzb3VyY2UucGF1c2UpIHtcbiAgICAgICAgc291cmNlLnBhdXNlKCk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgc291cmNlLm9uKCdkYXRhJywgb25kYXRhKTtcblxuICBmdW5jdGlvbiBvbmRyYWluKCkge1xuICAgIGlmIChzb3VyY2UucmVhZGFibGUgJiYgc291cmNlLnJlc3VtZSkge1xuICAgICAgc291cmNlLnJlc3VtZSgpO1xuICAgIH1cbiAgfVxuXG4gIGRlc3Qub24oJ2RyYWluJywgb25kcmFpbik7XG5cbiAgLy8gSWYgdGhlICdlbmQnIG9wdGlvbiBpcyBub3Qgc3VwcGxpZWQsIGRlc3QuZW5kKCkgd2lsbCBiZSBjYWxsZWQgd2hlblxuICAvLyBzb3VyY2UgZ2V0cyB0aGUgJ2VuZCcgb3IgJ2Nsb3NlJyBldmVudHMuICBPbmx5IGRlc3QuZW5kKCkgb25jZS5cbiAgaWYgKCFkZXN0Ll9pc1N0ZGlvICYmICghb3B0aW9ucyB8fCBvcHRpb25zLmVuZCAhPT0gZmFsc2UpKSB7XG4gICAgc291cmNlLm9uKCdlbmQnLCBvbmVuZCk7XG4gICAgc291cmNlLm9uKCdjbG9zZScsIG9uY2xvc2UpO1xuICB9XG5cbiAgdmFyIGRpZE9uRW5kID0gZmFsc2U7XG4gIGZ1bmN0aW9uIG9uZW5kKCkge1xuICAgIGlmIChkaWRPbkVuZCkgcmV0dXJuO1xuICAgIGRpZE9uRW5kID0gdHJ1ZTtcblxuICAgIGRlc3QuZW5kKCk7XG4gIH1cblxuXG4gIGZ1bmN0aW9uIG9uY2xvc2UoKSB7XG4gICAgaWYgKGRpZE9uRW5kKSByZXR1cm47XG4gICAgZGlkT25FbmQgPSB0cnVlO1xuXG4gICAgaWYgKHR5cGVvZiBkZXN0LmRlc3Ryb3kgPT09ICdmdW5jdGlvbicpIGRlc3QuZGVzdHJveSgpO1xuICB9XG5cbiAgLy8gZG9uJ3QgbGVhdmUgZGFuZ2xpbmcgcGlwZXMgd2hlbiB0aGVyZSBhcmUgZXJyb3JzLlxuICBmdW5jdGlvbiBvbmVycm9yKGVyKSB7XG4gICAgY2xlYW51cCgpO1xuICAgIGlmIChFRS5saXN0ZW5lckNvdW50KHRoaXMsICdlcnJvcicpID09PSAwKSB7XG4gICAgICB0aHJvdyBlcjsgLy8gVW5oYW5kbGVkIHN0cmVhbSBlcnJvciBpbiBwaXBlLlxuICAgIH1cbiAgfVxuXG4gIHNvdXJjZS5vbignZXJyb3InLCBvbmVycm9yKTtcbiAgZGVzdC5vbignZXJyb3InLCBvbmVycm9yKTtcblxuICAvLyByZW1vdmUgYWxsIHRoZSBldmVudCBsaXN0ZW5lcnMgdGhhdCB3ZXJlIGFkZGVkLlxuICBmdW5jdGlvbiBjbGVhbnVwKCkge1xuICAgIHNvdXJjZS5yZW1vdmVMaXN0ZW5lcignZGF0YScsIG9uZGF0YSk7XG4gICAgZGVzdC5yZW1vdmVMaXN0ZW5lcignZHJhaW4nLCBvbmRyYWluKTtcblxuICAgIHNvdXJjZS5yZW1vdmVMaXN0ZW5lcignZW5kJywgb25lbmQpO1xuICAgIHNvdXJjZS5yZW1vdmVMaXN0ZW5lcignY2xvc2UnLCBvbmNsb3NlKTtcblxuICAgIHNvdXJjZS5yZW1vdmVMaXN0ZW5lcignZXJyb3InLCBvbmVycm9yKTtcbiAgICBkZXN0LnJlbW92ZUxpc3RlbmVyKCdlcnJvcicsIG9uZXJyb3IpO1xuXG4gICAgc291cmNlLnJlbW92ZUxpc3RlbmVyKCdlbmQnLCBjbGVhbnVwKTtcbiAgICBzb3VyY2UucmVtb3ZlTGlzdGVuZXIoJ2Nsb3NlJywgY2xlYW51cCk7XG5cbiAgICBkZXN0LnJlbW92ZUxpc3RlbmVyKCdjbG9zZScsIGNsZWFudXApO1xuICB9XG5cbiAgc291cmNlLm9uKCdlbmQnLCBjbGVhbnVwKTtcbiAgc291cmNlLm9uKCdjbG9zZScsIGNsZWFudXApO1xuXG4gIGRlc3Qub24oJ2Nsb3NlJywgY2xlYW51cCk7XG5cbiAgZGVzdC5lbWl0KCdwaXBlJywgc291cmNlKTtcblxuICAvLyBBbGxvdyBmb3IgdW5peC1saWtlIHVzYWdlOiBBLnBpcGUoQikucGlwZShDKVxuICByZXR1cm4gZGVzdDtcbn07XG4iLCIvLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxudmFyIEJ1ZmZlciA9IHJlcXVpcmUoJ2J1ZmZlcicpLkJ1ZmZlcjtcblxudmFyIGlzQnVmZmVyRW5jb2RpbmcgPSBCdWZmZXIuaXNFbmNvZGluZ1xuICB8fCBmdW5jdGlvbihlbmNvZGluZykge1xuICAgICAgIHN3aXRjaCAoZW5jb2RpbmcgJiYgZW5jb2RpbmcudG9Mb3dlckNhc2UoKSkge1xuICAgICAgICAgY2FzZSAnaGV4JzogY2FzZSAndXRmOCc6IGNhc2UgJ3V0Zi04JzogY2FzZSAnYXNjaWknOiBjYXNlICdiaW5hcnknOiBjYXNlICdiYXNlNjQnOiBjYXNlICd1Y3MyJzogY2FzZSAndWNzLTInOiBjYXNlICd1dGYxNmxlJzogY2FzZSAndXRmLTE2bGUnOiBjYXNlICdyYXcnOiByZXR1cm4gdHJ1ZTtcbiAgICAgICAgIGRlZmF1bHQ6IHJldHVybiBmYWxzZTtcbiAgICAgICB9XG4gICAgIH1cblxuXG5mdW5jdGlvbiBhc3NlcnRFbmNvZGluZyhlbmNvZGluZykge1xuICBpZiAoZW5jb2RpbmcgJiYgIWlzQnVmZmVyRW5jb2RpbmcoZW5jb2RpbmcpKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdVbmtub3duIGVuY29kaW5nOiAnICsgZW5jb2RpbmcpO1xuICB9XG59XG5cbi8vIFN0cmluZ0RlY29kZXIgcHJvdmlkZXMgYW4gaW50ZXJmYWNlIGZvciBlZmZpY2llbnRseSBzcGxpdHRpbmcgYSBzZXJpZXMgb2Zcbi8vIGJ1ZmZlcnMgaW50byBhIHNlcmllcyBvZiBKUyBzdHJpbmdzIHdpdGhvdXQgYnJlYWtpbmcgYXBhcnQgbXVsdGktYnl0ZVxuLy8gY2hhcmFjdGVycy4gQ0VTVS04IGlzIGhhbmRsZWQgYXMgcGFydCBvZiB0aGUgVVRGLTggZW5jb2RpbmcuXG4vL1xuLy8gQFRPRE8gSGFuZGxpbmcgYWxsIGVuY29kaW5ncyBpbnNpZGUgYSBzaW5nbGUgb2JqZWN0IG1ha2VzIGl0IHZlcnkgZGlmZmljdWx0XG4vLyB0byByZWFzb24gYWJvdXQgdGhpcyBjb2RlLCBzbyBpdCBzaG91bGQgYmUgc3BsaXQgdXAgaW4gdGhlIGZ1dHVyZS5cbi8vIEBUT0RPIFRoZXJlIHNob3VsZCBiZSBhIHV0Zjgtc3RyaWN0IGVuY29kaW5nIHRoYXQgcmVqZWN0cyBpbnZhbGlkIFVURi04IGNvZGVcbi8vIHBvaW50cyBhcyB1c2VkIGJ5IENFU1UtOC5cbnZhciBTdHJpbmdEZWNvZGVyID0gZXhwb3J0cy5TdHJpbmdEZWNvZGVyID0gZnVuY3Rpb24oZW5jb2RpbmcpIHtcbiAgdGhpcy5lbmNvZGluZyA9IChlbmNvZGluZyB8fCAndXRmOCcpLnRvTG93ZXJDYXNlKCkucmVwbGFjZSgvWy1fXS8sICcnKTtcbiAgYXNzZXJ0RW5jb2RpbmcoZW5jb2RpbmcpO1xuICBzd2l0Y2ggKHRoaXMuZW5jb2RpbmcpIHtcbiAgICBjYXNlICd1dGY4JzpcbiAgICAgIC8vIENFU1UtOCByZXByZXNlbnRzIGVhY2ggb2YgU3Vycm9nYXRlIFBhaXIgYnkgMy1ieXRlc1xuICAgICAgdGhpcy5zdXJyb2dhdGVTaXplID0gMztcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ3VjczInOlxuICAgIGNhc2UgJ3V0ZjE2bGUnOlxuICAgICAgLy8gVVRGLTE2IHJlcHJlc2VudHMgZWFjaCBvZiBTdXJyb2dhdGUgUGFpciBieSAyLWJ5dGVzXG4gICAgICB0aGlzLnN1cnJvZ2F0ZVNpemUgPSAyO1xuICAgICAgdGhpcy5kZXRlY3RJbmNvbXBsZXRlQ2hhciA9IHV0ZjE2RGV0ZWN0SW5jb21wbGV0ZUNoYXI7XG4gICAgICBicmVhaztcbiAgICBjYXNlICdiYXNlNjQnOlxuICAgICAgLy8gQmFzZS02NCBzdG9yZXMgMyBieXRlcyBpbiA0IGNoYXJzLCBhbmQgcGFkcyB0aGUgcmVtYWluZGVyLlxuICAgICAgdGhpcy5zdXJyb2dhdGVTaXplID0gMztcbiAgICAgIHRoaXMuZGV0ZWN0SW5jb21wbGV0ZUNoYXIgPSBiYXNlNjREZXRlY3RJbmNvbXBsZXRlQ2hhcjtcbiAgICAgIGJyZWFrO1xuICAgIGRlZmF1bHQ6XG4gICAgICB0aGlzLndyaXRlID0gcGFzc1Rocm91Z2hXcml0ZTtcbiAgICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIEVub3VnaCBzcGFjZSB0byBzdG9yZSBhbGwgYnl0ZXMgb2YgYSBzaW5nbGUgY2hhcmFjdGVyLiBVVEYtOCBuZWVkcyA0XG4gIC8vIGJ5dGVzLCBidXQgQ0VTVS04IG1heSByZXF1aXJlIHVwIHRvIDYgKDMgYnl0ZXMgcGVyIHN1cnJvZ2F0ZSkuXG4gIHRoaXMuY2hhckJ1ZmZlciA9IG5ldyBCdWZmZXIoNik7XG4gIC8vIE51bWJlciBvZiBieXRlcyByZWNlaXZlZCBmb3IgdGhlIGN1cnJlbnQgaW5jb21wbGV0ZSBtdWx0aS1ieXRlIGNoYXJhY3Rlci5cbiAgdGhpcy5jaGFyUmVjZWl2ZWQgPSAwO1xuICAvLyBOdW1iZXIgb2YgYnl0ZXMgZXhwZWN0ZWQgZm9yIHRoZSBjdXJyZW50IGluY29tcGxldGUgbXVsdGktYnl0ZSBjaGFyYWN0ZXIuXG4gIHRoaXMuY2hhckxlbmd0aCA9IDA7XG59O1xuXG5cbi8vIHdyaXRlIGRlY29kZXMgdGhlIGdpdmVuIGJ1ZmZlciBhbmQgcmV0dXJucyBpdCBhcyBKUyBzdHJpbmcgdGhhdCBpc1xuLy8gZ3VhcmFudGVlZCB0byBub3QgY29udGFpbiBhbnkgcGFydGlhbCBtdWx0aS1ieXRlIGNoYXJhY3RlcnMuIEFueSBwYXJ0aWFsXG4vLyBjaGFyYWN0ZXIgZm91bmQgYXQgdGhlIGVuZCBvZiB0aGUgYnVmZmVyIGlzIGJ1ZmZlcmVkIHVwLCBhbmQgd2lsbCBiZVxuLy8gcmV0dXJuZWQgd2hlbiBjYWxsaW5nIHdyaXRlIGFnYWluIHdpdGggdGhlIHJlbWFpbmluZyBieXRlcy5cbi8vXG4vLyBOb3RlOiBDb252ZXJ0aW5nIGEgQnVmZmVyIGNvbnRhaW5pbmcgYW4gb3JwaGFuIHN1cnJvZ2F0ZSB0byBhIFN0cmluZ1xuLy8gY3VycmVudGx5IHdvcmtzLCBidXQgY29udmVydGluZyBhIFN0cmluZyB0byBhIEJ1ZmZlciAodmlhIGBuZXcgQnVmZmVyYCwgb3Jcbi8vIEJ1ZmZlciN3cml0ZSkgd2lsbCByZXBsYWNlIGluY29tcGxldGUgc3Vycm9nYXRlcyB3aXRoIHRoZSB1bmljb2RlXG4vLyByZXBsYWNlbWVudCBjaGFyYWN0ZXIuIFNlZSBodHRwczovL2NvZGVyZXZpZXcuY2hyb21pdW0ub3JnLzEyMTE3MzAwOS8gLlxuU3RyaW5nRGVjb2Rlci5wcm90b3R5cGUud3JpdGUgPSBmdW5jdGlvbihidWZmZXIpIHtcbiAgdmFyIGNoYXJTdHIgPSAnJztcbiAgLy8gaWYgb3VyIGxhc3Qgd3JpdGUgZW5kZWQgd2l0aCBhbiBpbmNvbXBsZXRlIG11bHRpYnl0ZSBjaGFyYWN0ZXJcbiAgd2hpbGUgKHRoaXMuY2hhckxlbmd0aCkge1xuICAgIC8vIGRldGVybWluZSBob3cgbWFueSByZW1haW5pbmcgYnl0ZXMgdGhpcyBidWZmZXIgaGFzIHRvIG9mZmVyIGZvciB0aGlzIGNoYXJcbiAgICB2YXIgYXZhaWxhYmxlID0gKGJ1ZmZlci5sZW5ndGggPj0gdGhpcy5jaGFyTGVuZ3RoIC0gdGhpcy5jaGFyUmVjZWl2ZWQpID9cbiAgICAgICAgdGhpcy5jaGFyTGVuZ3RoIC0gdGhpcy5jaGFyUmVjZWl2ZWQgOlxuICAgICAgICBidWZmZXIubGVuZ3RoO1xuXG4gICAgLy8gYWRkIHRoZSBuZXcgYnl0ZXMgdG8gdGhlIGNoYXIgYnVmZmVyXG4gICAgYnVmZmVyLmNvcHkodGhpcy5jaGFyQnVmZmVyLCB0aGlzLmNoYXJSZWNlaXZlZCwgMCwgYXZhaWxhYmxlKTtcbiAgICB0aGlzLmNoYXJSZWNlaXZlZCArPSBhdmFpbGFibGU7XG5cbiAgICBpZiAodGhpcy5jaGFyUmVjZWl2ZWQgPCB0aGlzLmNoYXJMZW5ndGgpIHtcbiAgICAgIC8vIHN0aWxsIG5vdCBlbm91Z2ggY2hhcnMgaW4gdGhpcyBidWZmZXI/IHdhaXQgZm9yIG1vcmUgLi4uXG4gICAgICByZXR1cm4gJyc7XG4gICAgfVxuXG4gICAgLy8gcmVtb3ZlIGJ5dGVzIGJlbG9uZ2luZyB0byB0aGUgY3VycmVudCBjaGFyYWN0ZXIgZnJvbSB0aGUgYnVmZmVyXG4gICAgYnVmZmVyID0gYnVmZmVyLnNsaWNlKGF2YWlsYWJsZSwgYnVmZmVyLmxlbmd0aCk7XG5cbiAgICAvLyBnZXQgdGhlIGNoYXJhY3RlciB0aGF0IHdhcyBzcGxpdFxuICAgIGNoYXJTdHIgPSB0aGlzLmNoYXJCdWZmZXIuc2xpY2UoMCwgdGhpcy5jaGFyTGVuZ3RoKS50b1N0cmluZyh0aGlzLmVuY29kaW5nKTtcblxuICAgIC8vIENFU1UtODogbGVhZCBzdXJyb2dhdGUgKEQ4MDAtREJGRikgaXMgYWxzbyB0aGUgaW5jb21wbGV0ZSBjaGFyYWN0ZXJcbiAgICB2YXIgY2hhckNvZGUgPSBjaGFyU3RyLmNoYXJDb2RlQXQoY2hhclN0ci5sZW5ndGggLSAxKTtcbiAgICBpZiAoY2hhckNvZGUgPj0gMHhEODAwICYmIGNoYXJDb2RlIDw9IDB4REJGRikge1xuICAgICAgdGhpcy5jaGFyTGVuZ3RoICs9IHRoaXMuc3Vycm9nYXRlU2l6ZTtcbiAgICAgIGNoYXJTdHIgPSAnJztcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICB0aGlzLmNoYXJSZWNlaXZlZCA9IHRoaXMuY2hhckxlbmd0aCA9IDA7XG5cbiAgICAvLyBpZiB0aGVyZSBhcmUgbm8gbW9yZSBieXRlcyBpbiB0aGlzIGJ1ZmZlciwganVzdCBlbWl0IG91ciBjaGFyXG4gICAgaWYgKGJ1ZmZlci5sZW5ndGggPT09IDApIHtcbiAgICAgIHJldHVybiBjaGFyU3RyO1xuICAgIH1cbiAgICBicmVhaztcbiAgfVxuXG4gIC8vIGRldGVybWluZSBhbmQgc2V0IGNoYXJMZW5ndGggLyBjaGFyUmVjZWl2ZWRcbiAgdGhpcy5kZXRlY3RJbmNvbXBsZXRlQ2hhcihidWZmZXIpO1xuXG4gIHZhciBlbmQgPSBidWZmZXIubGVuZ3RoO1xuICBpZiAodGhpcy5jaGFyTGVuZ3RoKSB7XG4gICAgLy8gYnVmZmVyIHRoZSBpbmNvbXBsZXRlIGNoYXJhY3RlciBieXRlcyB3ZSBnb3RcbiAgICBidWZmZXIuY29weSh0aGlzLmNoYXJCdWZmZXIsIDAsIGJ1ZmZlci5sZW5ndGggLSB0aGlzLmNoYXJSZWNlaXZlZCwgZW5kKTtcbiAgICBlbmQgLT0gdGhpcy5jaGFyUmVjZWl2ZWQ7XG4gIH1cblxuICBjaGFyU3RyICs9IGJ1ZmZlci50b1N0cmluZyh0aGlzLmVuY29kaW5nLCAwLCBlbmQpO1xuXG4gIHZhciBlbmQgPSBjaGFyU3RyLmxlbmd0aCAtIDE7XG4gIHZhciBjaGFyQ29kZSA9IGNoYXJTdHIuY2hhckNvZGVBdChlbmQpO1xuICAvLyBDRVNVLTg6IGxlYWQgc3Vycm9nYXRlIChEODAwLURCRkYpIGlzIGFsc28gdGhlIGluY29tcGxldGUgY2hhcmFjdGVyXG4gIGlmIChjaGFyQ29kZSA+PSAweEQ4MDAgJiYgY2hhckNvZGUgPD0gMHhEQkZGKSB7XG4gICAgdmFyIHNpemUgPSB0aGlzLnN1cnJvZ2F0ZVNpemU7XG4gICAgdGhpcy5jaGFyTGVuZ3RoICs9IHNpemU7XG4gICAgdGhpcy5jaGFyUmVjZWl2ZWQgKz0gc2l6ZTtcbiAgICB0aGlzLmNoYXJCdWZmZXIuY29weSh0aGlzLmNoYXJCdWZmZXIsIHNpemUsIDAsIHNpemUpO1xuICAgIGJ1ZmZlci5jb3B5KHRoaXMuY2hhckJ1ZmZlciwgMCwgMCwgc2l6ZSk7XG4gICAgcmV0dXJuIGNoYXJTdHIuc3Vic3RyaW5nKDAsIGVuZCk7XG4gIH1cblxuICAvLyBvciBqdXN0IGVtaXQgdGhlIGNoYXJTdHJcbiAgcmV0dXJuIGNoYXJTdHI7XG59O1xuXG4vLyBkZXRlY3RJbmNvbXBsZXRlQ2hhciBkZXRlcm1pbmVzIGlmIHRoZXJlIGlzIGFuIGluY29tcGxldGUgVVRGLTggY2hhcmFjdGVyIGF0XG4vLyB0aGUgZW5kIG9mIHRoZSBnaXZlbiBidWZmZXIuIElmIHNvLCBpdCBzZXRzIHRoaXMuY2hhckxlbmd0aCB0byB0aGUgYnl0ZVxuLy8gbGVuZ3RoIHRoYXQgY2hhcmFjdGVyLCBhbmQgc2V0cyB0aGlzLmNoYXJSZWNlaXZlZCB0byB0aGUgbnVtYmVyIG9mIGJ5dGVzXG4vLyB0aGF0IGFyZSBhdmFpbGFibGUgZm9yIHRoaXMgY2hhcmFjdGVyLlxuU3RyaW5nRGVjb2Rlci5wcm90b3R5cGUuZGV0ZWN0SW5jb21wbGV0ZUNoYXIgPSBmdW5jdGlvbihidWZmZXIpIHtcbiAgLy8gZGV0ZXJtaW5lIGhvdyBtYW55IGJ5dGVzIHdlIGhhdmUgdG8gY2hlY2sgYXQgdGhlIGVuZCBvZiB0aGlzIGJ1ZmZlclxuICB2YXIgaSA9IChidWZmZXIubGVuZ3RoID49IDMpID8gMyA6IGJ1ZmZlci5sZW5ndGg7XG5cbiAgLy8gRmlndXJlIG91dCBpZiBvbmUgb2YgdGhlIGxhc3QgaSBieXRlcyBvZiBvdXIgYnVmZmVyIGFubm91bmNlcyBhblxuICAvLyBpbmNvbXBsZXRlIGNoYXIuXG4gIGZvciAoOyBpID4gMDsgaS0tKSB7XG4gICAgdmFyIGMgPSBidWZmZXJbYnVmZmVyLmxlbmd0aCAtIGldO1xuXG4gICAgLy8gU2VlIGh0dHA6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvVVRGLTgjRGVzY3JpcHRpb25cblxuICAgIC8vIDExMFhYWFhYXG4gICAgaWYgKGkgPT0gMSAmJiBjID4+IDUgPT0gMHgwNikge1xuICAgICAgdGhpcy5jaGFyTGVuZ3RoID0gMjtcbiAgICAgIGJyZWFrO1xuICAgIH1cblxuICAgIC8vIDExMTBYWFhYXG4gICAgaWYgKGkgPD0gMiAmJiBjID4+IDQgPT0gMHgwRSkge1xuICAgICAgdGhpcy5jaGFyTGVuZ3RoID0gMztcbiAgICAgIGJyZWFrO1xuICAgIH1cblxuICAgIC8vIDExMTEwWFhYXG4gICAgaWYgKGkgPD0gMyAmJiBjID4+IDMgPT0gMHgxRSkge1xuICAgICAgdGhpcy5jaGFyTGVuZ3RoID0gNDtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuICB0aGlzLmNoYXJSZWNlaXZlZCA9IGk7XG59O1xuXG5TdHJpbmdEZWNvZGVyLnByb3RvdHlwZS5lbmQgPSBmdW5jdGlvbihidWZmZXIpIHtcbiAgdmFyIHJlcyA9ICcnO1xuICBpZiAoYnVmZmVyICYmIGJ1ZmZlci5sZW5ndGgpXG4gICAgcmVzID0gdGhpcy53cml0ZShidWZmZXIpO1xuXG4gIGlmICh0aGlzLmNoYXJSZWNlaXZlZCkge1xuICAgIHZhciBjciA9IHRoaXMuY2hhclJlY2VpdmVkO1xuICAgIHZhciBidWYgPSB0aGlzLmNoYXJCdWZmZXI7XG4gICAgdmFyIGVuYyA9IHRoaXMuZW5jb2Rpbmc7XG4gICAgcmVzICs9IGJ1Zi5zbGljZSgwLCBjcikudG9TdHJpbmcoZW5jKTtcbiAgfVxuXG4gIHJldHVybiByZXM7XG59O1xuXG5mdW5jdGlvbiBwYXNzVGhyb3VnaFdyaXRlKGJ1ZmZlcikge1xuICByZXR1cm4gYnVmZmVyLnRvU3RyaW5nKHRoaXMuZW5jb2RpbmcpO1xufVxuXG5mdW5jdGlvbiB1dGYxNkRldGVjdEluY29tcGxldGVDaGFyKGJ1ZmZlcikge1xuICB0aGlzLmNoYXJSZWNlaXZlZCA9IGJ1ZmZlci5sZW5ndGggJSAyO1xuICB0aGlzLmNoYXJMZW5ndGggPSB0aGlzLmNoYXJSZWNlaXZlZCA/IDIgOiAwO1xufVxuXG5mdW5jdGlvbiBiYXNlNjREZXRlY3RJbmNvbXBsZXRlQ2hhcihidWZmZXIpIHtcbiAgdGhpcy5jaGFyUmVjZWl2ZWQgPSBidWZmZXIubGVuZ3RoICUgMztcbiAgdGhpcy5jaGFyTGVuZ3RoID0gdGhpcy5jaGFyUmVjZWl2ZWQgPyAzIDogMDtcbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gaXNCdWZmZXIoYXJnKSB7XG4gIHJldHVybiBhcmcgJiYgdHlwZW9mIGFyZyA9PT0gJ29iamVjdCdcbiAgICAmJiB0eXBlb2YgYXJnLmNvcHkgPT09ICdmdW5jdGlvbidcbiAgICAmJiB0eXBlb2YgYXJnLmZpbGwgPT09ICdmdW5jdGlvbidcbiAgICAmJiB0eXBlb2YgYXJnLnJlYWRVSW50OCA9PT0gJ2Z1bmN0aW9uJztcbn0iLCIvLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxudmFyIGZvcm1hdFJlZ0V4cCA9IC8lW3NkaiVdL2c7XG5leHBvcnRzLmZvcm1hdCA9IGZ1bmN0aW9uKGYpIHtcbiAgaWYgKCFpc1N0cmluZyhmKSkge1xuICAgIHZhciBvYmplY3RzID0gW107XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcmd1bWVudHMubGVuZ3RoOyBpKyspIHtcbiAgICAgIG9iamVjdHMucHVzaChpbnNwZWN0KGFyZ3VtZW50c1tpXSkpO1xuICAgIH1cbiAgICByZXR1cm4gb2JqZWN0cy5qb2luKCcgJyk7XG4gIH1cblxuICB2YXIgaSA9IDE7XG4gIHZhciBhcmdzID0gYXJndW1lbnRzO1xuICB2YXIgbGVuID0gYXJncy5sZW5ndGg7XG4gIHZhciBzdHIgPSBTdHJpbmcoZikucmVwbGFjZShmb3JtYXRSZWdFeHAsIGZ1bmN0aW9uKHgpIHtcbiAgICBpZiAoeCA9PT0gJyUlJykgcmV0dXJuICclJztcbiAgICBpZiAoaSA+PSBsZW4pIHJldHVybiB4O1xuICAgIHN3aXRjaCAoeCkge1xuICAgICAgY2FzZSAnJXMnOiByZXR1cm4gU3RyaW5nKGFyZ3NbaSsrXSk7XG4gICAgICBjYXNlICclZCc6IHJldHVybiBOdW1iZXIoYXJnc1tpKytdKTtcbiAgICAgIGNhc2UgJyVqJzpcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICByZXR1cm4gSlNPTi5zdHJpbmdpZnkoYXJnc1tpKytdKTtcbiAgICAgICAgfSBjYXRjaCAoXykge1xuICAgICAgICAgIHJldHVybiAnW0NpcmN1bGFyXSc7XG4gICAgICAgIH1cbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHJldHVybiB4O1xuICAgIH1cbiAgfSk7XG4gIGZvciAodmFyIHggPSBhcmdzW2ldOyBpIDwgbGVuOyB4ID0gYXJnc1srK2ldKSB7XG4gICAgaWYgKGlzTnVsbCh4KSB8fCAhaXNPYmplY3QoeCkpIHtcbiAgICAgIHN0ciArPSAnICcgKyB4O1xuICAgIH0gZWxzZSB7XG4gICAgICBzdHIgKz0gJyAnICsgaW5zcGVjdCh4KTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHN0cjtcbn07XG5cblxuLy8gTWFyayB0aGF0IGEgbWV0aG9kIHNob3VsZCBub3QgYmUgdXNlZC5cbi8vIFJldHVybnMgYSBtb2RpZmllZCBmdW5jdGlvbiB3aGljaCB3YXJucyBvbmNlIGJ5IGRlZmF1bHQuXG4vLyBJZiAtLW5vLWRlcHJlY2F0aW9uIGlzIHNldCwgdGhlbiBpdCBpcyBhIG5vLW9wLlxuZXhwb3J0cy5kZXByZWNhdGUgPSBmdW5jdGlvbihmbiwgbXNnKSB7XG4gIC8vIEFsbG93IGZvciBkZXByZWNhdGluZyB0aGluZ3MgaW4gdGhlIHByb2Nlc3Mgb2Ygc3RhcnRpbmcgdXAuXG4gIGlmIChpc1VuZGVmaW5lZChnbG9iYWwucHJvY2VzcykpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gZXhwb3J0cy5kZXByZWNhdGUoZm4sIG1zZykuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICB9O1xuICB9XG5cbiAgaWYgKHByb2Nlc3Mubm9EZXByZWNhdGlvbiA9PT0gdHJ1ZSkge1xuICAgIHJldHVybiBmbjtcbiAgfVxuXG4gIHZhciB3YXJuZWQgPSBmYWxzZTtcbiAgZnVuY3Rpb24gZGVwcmVjYXRlZCgpIHtcbiAgICBpZiAoIXdhcm5lZCkge1xuICAgICAgaWYgKHByb2Nlc3MudGhyb3dEZXByZWNhdGlvbikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IobXNnKTtcbiAgICAgIH0gZWxzZSBpZiAocHJvY2Vzcy50cmFjZURlcHJlY2F0aW9uKSB7XG4gICAgICAgIGNvbnNvbGUudHJhY2UobXNnKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IobXNnKTtcbiAgICAgIH1cbiAgICAgIHdhcm5lZCA9IHRydWU7XG4gICAgfVxuICAgIHJldHVybiBmbi5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICB9XG5cbiAgcmV0dXJuIGRlcHJlY2F0ZWQ7XG59O1xuXG5cbnZhciBkZWJ1Z3MgPSB7fTtcbnZhciBkZWJ1Z0Vudmlyb247XG5leHBvcnRzLmRlYnVnbG9nID0gZnVuY3Rpb24oc2V0KSB7XG4gIGlmIChpc1VuZGVmaW5lZChkZWJ1Z0Vudmlyb24pKVxuICAgIGRlYnVnRW52aXJvbiA9IHByb2Nlc3MuZW52Lk5PREVfREVCVUcgfHwgJyc7XG4gIHNldCA9IHNldC50b1VwcGVyQ2FzZSgpO1xuICBpZiAoIWRlYnVnc1tzZXRdKSB7XG4gICAgaWYgKG5ldyBSZWdFeHAoJ1xcXFxiJyArIHNldCArICdcXFxcYicsICdpJykudGVzdChkZWJ1Z0Vudmlyb24pKSB7XG4gICAgICB2YXIgcGlkID0gcHJvY2Vzcy5waWQ7XG4gICAgICBkZWJ1Z3Nbc2V0XSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgbXNnID0gZXhwb3J0cy5mb3JtYXQuYXBwbHkoZXhwb3J0cywgYXJndW1lbnRzKTtcbiAgICAgICAgY29uc29sZS5lcnJvcignJXMgJWQ6ICVzJywgc2V0LCBwaWQsIG1zZyk7XG4gICAgICB9O1xuICAgIH0gZWxzZSB7XG4gICAgICBkZWJ1Z3Nbc2V0XSA9IGZ1bmN0aW9uKCkge307XG4gICAgfVxuICB9XG4gIHJldHVybiBkZWJ1Z3Nbc2V0XTtcbn07XG5cblxuLyoqXG4gKiBFY2hvcyB0aGUgdmFsdWUgb2YgYSB2YWx1ZS4gVHJ5cyB0byBwcmludCB0aGUgdmFsdWUgb3V0XG4gKiBpbiB0aGUgYmVzdCB3YXkgcG9zc2libGUgZ2l2ZW4gdGhlIGRpZmZlcmVudCB0eXBlcy5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqIFRoZSBvYmplY3QgdG8gcHJpbnQgb3V0LlxuICogQHBhcmFtIHtPYmplY3R9IG9wdHMgT3B0aW9uYWwgb3B0aW9ucyBvYmplY3QgdGhhdCBhbHRlcnMgdGhlIG91dHB1dC5cbiAqL1xuLyogbGVnYWN5OiBvYmosIHNob3dIaWRkZW4sIGRlcHRoLCBjb2xvcnMqL1xuZnVuY3Rpb24gaW5zcGVjdChvYmosIG9wdHMpIHtcbiAgLy8gZGVmYXVsdCBvcHRpb25zXG4gIHZhciBjdHggPSB7XG4gICAgc2VlbjogW10sXG4gICAgc3R5bGl6ZTogc3R5bGl6ZU5vQ29sb3JcbiAgfTtcbiAgLy8gbGVnYWN5Li4uXG4gIGlmIChhcmd1bWVudHMubGVuZ3RoID49IDMpIGN0eC5kZXB0aCA9IGFyZ3VtZW50c1syXTtcbiAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPj0gNCkgY3R4LmNvbG9ycyA9IGFyZ3VtZW50c1szXTtcbiAgaWYgKGlzQm9vbGVhbihvcHRzKSkge1xuICAgIC8vIGxlZ2FjeS4uLlxuICAgIGN0eC5zaG93SGlkZGVuID0gb3B0cztcbiAgfSBlbHNlIGlmIChvcHRzKSB7XG4gICAgLy8gZ290IGFuIFwib3B0aW9uc1wiIG9iamVjdFxuICAgIGV4cG9ydHMuX2V4dGVuZChjdHgsIG9wdHMpO1xuICB9XG4gIC8vIHNldCBkZWZhdWx0IG9wdGlvbnNcbiAgaWYgKGlzVW5kZWZpbmVkKGN0eC5zaG93SGlkZGVuKSkgY3R4LnNob3dIaWRkZW4gPSBmYWxzZTtcbiAgaWYgKGlzVW5kZWZpbmVkKGN0eC5kZXB0aCkpIGN0eC5kZXB0aCA9IDI7XG4gIGlmIChpc1VuZGVmaW5lZChjdHguY29sb3JzKSkgY3R4LmNvbG9ycyA9IGZhbHNlO1xuICBpZiAoaXNVbmRlZmluZWQoY3R4LmN1c3RvbUluc3BlY3QpKSBjdHguY3VzdG9tSW5zcGVjdCA9IHRydWU7XG4gIGlmIChjdHguY29sb3JzKSBjdHguc3R5bGl6ZSA9IHN0eWxpemVXaXRoQ29sb3I7XG4gIHJldHVybiBmb3JtYXRWYWx1ZShjdHgsIG9iaiwgY3R4LmRlcHRoKTtcbn1cbmV4cG9ydHMuaW5zcGVjdCA9IGluc3BlY3Q7XG5cblxuLy8gaHR0cDovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9BTlNJX2VzY2FwZV9jb2RlI2dyYXBoaWNzXG5pbnNwZWN0LmNvbG9ycyA9IHtcbiAgJ2JvbGQnIDogWzEsIDIyXSxcbiAgJ2l0YWxpYycgOiBbMywgMjNdLFxuICAndW5kZXJsaW5lJyA6IFs0LCAyNF0sXG4gICdpbnZlcnNlJyA6IFs3LCAyN10sXG4gICd3aGl0ZScgOiBbMzcsIDM5XSxcbiAgJ2dyZXknIDogWzkwLCAzOV0sXG4gICdibGFjaycgOiBbMzAsIDM5XSxcbiAgJ2JsdWUnIDogWzM0LCAzOV0sXG4gICdjeWFuJyA6IFszNiwgMzldLFxuICAnZ3JlZW4nIDogWzMyLCAzOV0sXG4gICdtYWdlbnRhJyA6IFszNSwgMzldLFxuICAncmVkJyA6IFszMSwgMzldLFxuICAneWVsbG93JyA6IFszMywgMzldXG59O1xuXG4vLyBEb24ndCB1c2UgJ2JsdWUnIG5vdCB2aXNpYmxlIG9uIGNtZC5leGVcbmluc3BlY3Quc3R5bGVzID0ge1xuICAnc3BlY2lhbCc6ICdjeWFuJyxcbiAgJ251bWJlcic6ICd5ZWxsb3cnLFxuICAnYm9vbGVhbic6ICd5ZWxsb3cnLFxuICAndW5kZWZpbmVkJzogJ2dyZXknLFxuICAnbnVsbCc6ICdib2xkJyxcbiAgJ3N0cmluZyc6ICdncmVlbicsXG4gICdkYXRlJzogJ21hZ2VudGEnLFxuICAvLyBcIm5hbWVcIjogaW50ZW50aW9uYWxseSBub3Qgc3R5bGluZ1xuICAncmVnZXhwJzogJ3JlZCdcbn07XG5cblxuZnVuY3Rpb24gc3R5bGl6ZVdpdGhDb2xvcihzdHIsIHN0eWxlVHlwZSkge1xuICB2YXIgc3R5bGUgPSBpbnNwZWN0LnN0eWxlc1tzdHlsZVR5cGVdO1xuXG4gIGlmIChzdHlsZSkge1xuICAgIHJldHVybiAnXFx1MDAxYlsnICsgaW5zcGVjdC5jb2xvcnNbc3R5bGVdWzBdICsgJ20nICsgc3RyICtcbiAgICAgICAgICAgJ1xcdTAwMWJbJyArIGluc3BlY3QuY29sb3JzW3N0eWxlXVsxXSArICdtJztcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gc3RyO1xuICB9XG59XG5cblxuZnVuY3Rpb24gc3R5bGl6ZU5vQ29sb3Ioc3RyLCBzdHlsZVR5cGUpIHtcbiAgcmV0dXJuIHN0cjtcbn1cblxuXG5mdW5jdGlvbiBhcnJheVRvSGFzaChhcnJheSkge1xuICB2YXIgaGFzaCA9IHt9O1xuXG4gIGFycmF5LmZvckVhY2goZnVuY3Rpb24odmFsLCBpZHgpIHtcbiAgICBoYXNoW3ZhbF0gPSB0cnVlO1xuICB9KTtcblxuICByZXR1cm4gaGFzaDtcbn1cblxuXG5mdW5jdGlvbiBmb3JtYXRWYWx1ZShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMpIHtcbiAgLy8gUHJvdmlkZSBhIGhvb2sgZm9yIHVzZXItc3BlY2lmaWVkIGluc3BlY3QgZnVuY3Rpb25zLlxuICAvLyBDaGVjayB0aGF0IHZhbHVlIGlzIGFuIG9iamVjdCB3aXRoIGFuIGluc3BlY3QgZnVuY3Rpb24gb24gaXRcbiAgaWYgKGN0eC5jdXN0b21JbnNwZWN0ICYmXG4gICAgICB2YWx1ZSAmJlxuICAgICAgaXNGdW5jdGlvbih2YWx1ZS5pbnNwZWN0KSAmJlxuICAgICAgLy8gRmlsdGVyIG91dCB0aGUgdXRpbCBtb2R1bGUsIGl0J3MgaW5zcGVjdCBmdW5jdGlvbiBpcyBzcGVjaWFsXG4gICAgICB2YWx1ZS5pbnNwZWN0ICE9PSBleHBvcnRzLmluc3BlY3QgJiZcbiAgICAgIC8vIEFsc28gZmlsdGVyIG91dCBhbnkgcHJvdG90eXBlIG9iamVjdHMgdXNpbmcgdGhlIGNpcmN1bGFyIGNoZWNrLlxuICAgICAgISh2YWx1ZS5jb25zdHJ1Y3RvciAmJiB2YWx1ZS5jb25zdHJ1Y3Rvci5wcm90b3R5cGUgPT09IHZhbHVlKSkge1xuICAgIHZhciByZXQgPSB2YWx1ZS5pbnNwZWN0KHJlY3Vyc2VUaW1lcywgY3R4KTtcbiAgICBpZiAoIWlzU3RyaW5nKHJldCkpIHtcbiAgICAgIHJldCA9IGZvcm1hdFZhbHVlKGN0eCwgcmV0LCByZWN1cnNlVGltZXMpO1xuICAgIH1cbiAgICByZXR1cm4gcmV0O1xuICB9XG5cbiAgLy8gUHJpbWl0aXZlIHR5cGVzIGNhbm5vdCBoYXZlIHByb3BlcnRpZXNcbiAgdmFyIHByaW1pdGl2ZSA9IGZvcm1hdFByaW1pdGl2ZShjdHgsIHZhbHVlKTtcbiAgaWYgKHByaW1pdGl2ZSkge1xuICAgIHJldHVybiBwcmltaXRpdmU7XG4gIH1cblxuICAvLyBMb29rIHVwIHRoZSBrZXlzIG9mIHRoZSBvYmplY3QuXG4gIHZhciBrZXlzID0gT2JqZWN0LmtleXModmFsdWUpO1xuICB2YXIgdmlzaWJsZUtleXMgPSBhcnJheVRvSGFzaChrZXlzKTtcblxuICBpZiAoY3R4LnNob3dIaWRkZW4pIHtcbiAgICBrZXlzID0gT2JqZWN0LmdldE93blByb3BlcnR5TmFtZXModmFsdWUpO1xuICB9XG5cbiAgLy8gSUUgZG9lc24ndCBtYWtlIGVycm9yIGZpZWxkcyBub24tZW51bWVyYWJsZVxuICAvLyBodHRwOi8vbXNkbi5taWNyb3NvZnQuY29tL2VuLXVzL2xpYnJhcnkvaWUvZHd3NTJzYnQodj12cy45NCkuYXNweFxuICBpZiAoaXNFcnJvcih2YWx1ZSlcbiAgICAgICYmIChrZXlzLmluZGV4T2YoJ21lc3NhZ2UnKSA+PSAwIHx8IGtleXMuaW5kZXhPZignZGVzY3JpcHRpb24nKSA+PSAwKSkge1xuICAgIHJldHVybiBmb3JtYXRFcnJvcih2YWx1ZSk7XG4gIH1cblxuICAvLyBTb21lIHR5cGUgb2Ygb2JqZWN0IHdpdGhvdXQgcHJvcGVydGllcyBjYW4gYmUgc2hvcnRjdXR0ZWQuXG4gIGlmIChrZXlzLmxlbmd0aCA9PT0gMCkge1xuICAgIGlmIChpc0Z1bmN0aW9uKHZhbHVlKSkge1xuICAgICAgdmFyIG5hbWUgPSB2YWx1ZS5uYW1lID8gJzogJyArIHZhbHVlLm5hbWUgOiAnJztcbiAgICAgIHJldHVybiBjdHguc3R5bGl6ZSgnW0Z1bmN0aW9uJyArIG5hbWUgKyAnXScsICdzcGVjaWFsJyk7XG4gICAgfVxuICAgIGlmIChpc1JlZ0V4cCh2YWx1ZSkpIHtcbiAgICAgIHJldHVybiBjdHguc3R5bGl6ZShSZWdFeHAucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwodmFsdWUpLCAncmVnZXhwJyk7XG4gICAgfVxuICAgIGlmIChpc0RhdGUodmFsdWUpKSB7XG4gICAgICByZXR1cm4gY3R4LnN0eWxpemUoRGF0ZS5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh2YWx1ZSksICdkYXRlJyk7XG4gICAgfVxuICAgIGlmIChpc0Vycm9yKHZhbHVlKSkge1xuICAgICAgcmV0dXJuIGZvcm1hdEVycm9yKHZhbHVlKTtcbiAgICB9XG4gIH1cblxuICB2YXIgYmFzZSA9ICcnLCBhcnJheSA9IGZhbHNlLCBicmFjZXMgPSBbJ3snLCAnfSddO1xuXG4gIC8vIE1ha2UgQXJyYXkgc2F5IHRoYXQgdGhleSBhcmUgQXJyYXlcbiAgaWYgKGlzQXJyYXkodmFsdWUpKSB7XG4gICAgYXJyYXkgPSB0cnVlO1xuICAgIGJyYWNlcyA9IFsnWycsICddJ107XG4gIH1cblxuICAvLyBNYWtlIGZ1bmN0aW9ucyBzYXkgdGhhdCB0aGV5IGFyZSBmdW5jdGlvbnNcbiAgaWYgKGlzRnVuY3Rpb24odmFsdWUpKSB7XG4gICAgdmFyIG4gPSB2YWx1ZS5uYW1lID8gJzogJyArIHZhbHVlLm5hbWUgOiAnJztcbiAgICBiYXNlID0gJyBbRnVuY3Rpb24nICsgbiArICddJztcbiAgfVxuXG4gIC8vIE1ha2UgUmVnRXhwcyBzYXkgdGhhdCB0aGV5IGFyZSBSZWdFeHBzXG4gIGlmIChpc1JlZ0V4cCh2YWx1ZSkpIHtcbiAgICBiYXNlID0gJyAnICsgUmVnRXhwLnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHZhbHVlKTtcbiAgfVxuXG4gIC8vIE1ha2UgZGF0ZXMgd2l0aCBwcm9wZXJ0aWVzIGZpcnN0IHNheSB0aGUgZGF0ZVxuICBpZiAoaXNEYXRlKHZhbHVlKSkge1xuICAgIGJhc2UgPSAnICcgKyBEYXRlLnByb3RvdHlwZS50b1VUQ1N0cmluZy5jYWxsKHZhbHVlKTtcbiAgfVxuXG4gIC8vIE1ha2UgZXJyb3Igd2l0aCBtZXNzYWdlIGZpcnN0IHNheSB0aGUgZXJyb3JcbiAgaWYgKGlzRXJyb3IodmFsdWUpKSB7XG4gICAgYmFzZSA9ICcgJyArIGZvcm1hdEVycm9yKHZhbHVlKTtcbiAgfVxuXG4gIGlmIChrZXlzLmxlbmd0aCA9PT0gMCAmJiAoIWFycmF5IHx8IHZhbHVlLmxlbmd0aCA9PSAwKSkge1xuICAgIHJldHVybiBicmFjZXNbMF0gKyBiYXNlICsgYnJhY2VzWzFdO1xuICB9XG5cbiAgaWYgKHJlY3Vyc2VUaW1lcyA8IDApIHtcbiAgICBpZiAoaXNSZWdFeHAodmFsdWUpKSB7XG4gICAgICByZXR1cm4gY3R4LnN0eWxpemUoUmVnRXhwLnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHZhbHVlKSwgJ3JlZ2V4cCcpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gY3R4LnN0eWxpemUoJ1tPYmplY3RdJywgJ3NwZWNpYWwnKTtcbiAgICB9XG4gIH1cblxuICBjdHguc2Vlbi5wdXNoKHZhbHVlKTtcblxuICB2YXIgb3V0cHV0O1xuICBpZiAoYXJyYXkpIHtcbiAgICBvdXRwdXQgPSBmb3JtYXRBcnJheShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMsIHZpc2libGVLZXlzLCBrZXlzKTtcbiAgfSBlbHNlIHtcbiAgICBvdXRwdXQgPSBrZXlzLm1hcChmdW5jdGlvbihrZXkpIHtcbiAgICAgIHJldHVybiBmb3JtYXRQcm9wZXJ0eShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMsIHZpc2libGVLZXlzLCBrZXksIGFycmF5KTtcbiAgICB9KTtcbiAgfVxuXG4gIGN0eC5zZWVuLnBvcCgpO1xuXG4gIHJldHVybiByZWR1Y2VUb1NpbmdsZVN0cmluZyhvdXRwdXQsIGJhc2UsIGJyYWNlcyk7XG59XG5cblxuZnVuY3Rpb24gZm9ybWF0UHJpbWl0aXZlKGN0eCwgdmFsdWUpIHtcbiAgaWYgKGlzVW5kZWZpbmVkKHZhbHVlKSlcbiAgICByZXR1cm4gY3R4LnN0eWxpemUoJ3VuZGVmaW5lZCcsICd1bmRlZmluZWQnKTtcbiAgaWYgKGlzU3RyaW5nKHZhbHVlKSkge1xuICAgIHZhciBzaW1wbGUgPSAnXFwnJyArIEpTT04uc3RyaW5naWZ5KHZhbHVlKS5yZXBsYWNlKC9eXCJ8XCIkL2csICcnKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLnJlcGxhY2UoLycvZywgXCJcXFxcJ1wiKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLnJlcGxhY2UoL1xcXFxcIi9nLCAnXCInKSArICdcXCcnO1xuICAgIHJldHVybiBjdHguc3R5bGl6ZShzaW1wbGUsICdzdHJpbmcnKTtcbiAgfVxuICBpZiAoaXNOdW1iZXIodmFsdWUpKVxuICAgIHJldHVybiBjdHguc3R5bGl6ZSgnJyArIHZhbHVlLCAnbnVtYmVyJyk7XG4gIGlmIChpc0Jvb2xlYW4odmFsdWUpKVxuICAgIHJldHVybiBjdHguc3R5bGl6ZSgnJyArIHZhbHVlLCAnYm9vbGVhbicpO1xuICAvLyBGb3Igc29tZSByZWFzb24gdHlwZW9mIG51bGwgaXMgXCJvYmplY3RcIiwgc28gc3BlY2lhbCBjYXNlIGhlcmUuXG4gIGlmIChpc051bGwodmFsdWUpKVxuICAgIHJldHVybiBjdHguc3R5bGl6ZSgnbnVsbCcsICdudWxsJyk7XG59XG5cblxuZnVuY3Rpb24gZm9ybWF0RXJyb3IodmFsdWUpIHtcbiAgcmV0dXJuICdbJyArIEVycm9yLnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHZhbHVlKSArICddJztcbn1cblxuXG5mdW5jdGlvbiBmb3JtYXRBcnJheShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMsIHZpc2libGVLZXlzLCBrZXlzKSB7XG4gIHZhciBvdXRwdXQgPSBbXTtcbiAgZm9yICh2YXIgaSA9IDAsIGwgPSB2YWx1ZS5sZW5ndGg7IGkgPCBsOyArK2kpIHtcbiAgICBpZiAoaGFzT3duUHJvcGVydHkodmFsdWUsIFN0cmluZyhpKSkpIHtcbiAgICAgIG91dHB1dC5wdXNoKGZvcm1hdFByb3BlcnR5KGN0eCwgdmFsdWUsIHJlY3Vyc2VUaW1lcywgdmlzaWJsZUtleXMsXG4gICAgICAgICAgU3RyaW5nKGkpLCB0cnVlKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIG91dHB1dC5wdXNoKCcnKTtcbiAgICB9XG4gIH1cbiAga2V5cy5mb3JFYWNoKGZ1bmN0aW9uKGtleSkge1xuICAgIGlmICgha2V5Lm1hdGNoKC9eXFxkKyQvKSkge1xuICAgICAgb3V0cHV0LnB1c2goZm9ybWF0UHJvcGVydHkoY3R4LCB2YWx1ZSwgcmVjdXJzZVRpbWVzLCB2aXNpYmxlS2V5cyxcbiAgICAgICAgICBrZXksIHRydWUpKTtcbiAgICB9XG4gIH0pO1xuICByZXR1cm4gb3V0cHV0O1xufVxuXG5cbmZ1bmN0aW9uIGZvcm1hdFByb3BlcnR5KGN0eCwgdmFsdWUsIHJlY3Vyc2VUaW1lcywgdmlzaWJsZUtleXMsIGtleSwgYXJyYXkpIHtcbiAgdmFyIG5hbWUsIHN0ciwgZGVzYztcbiAgZGVzYyA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IodmFsdWUsIGtleSkgfHwgeyB2YWx1ZTogdmFsdWVba2V5XSB9O1xuICBpZiAoZGVzYy5nZXQpIHtcbiAgICBpZiAoZGVzYy5zZXQpIHtcbiAgICAgIHN0ciA9IGN0eC5zdHlsaXplKCdbR2V0dGVyL1NldHRlcl0nLCAnc3BlY2lhbCcpO1xuICAgIH0gZWxzZSB7XG4gICAgICBzdHIgPSBjdHguc3R5bGl6ZSgnW0dldHRlcl0nLCAnc3BlY2lhbCcpO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBpZiAoZGVzYy5zZXQpIHtcbiAgICAgIHN0ciA9IGN0eC5zdHlsaXplKCdbU2V0dGVyXScsICdzcGVjaWFsJyk7XG4gICAgfVxuICB9XG4gIGlmICghaGFzT3duUHJvcGVydHkodmlzaWJsZUtleXMsIGtleSkpIHtcbiAgICBuYW1lID0gJ1snICsga2V5ICsgJ10nO1xuICB9XG4gIGlmICghc3RyKSB7XG4gICAgaWYgKGN0eC5zZWVuLmluZGV4T2YoZGVzYy52YWx1ZSkgPCAwKSB7XG4gICAgICBpZiAoaXNOdWxsKHJlY3Vyc2VUaW1lcykpIHtcbiAgICAgICAgc3RyID0gZm9ybWF0VmFsdWUoY3R4LCBkZXNjLnZhbHVlLCBudWxsKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHN0ciA9IGZvcm1hdFZhbHVlKGN0eCwgZGVzYy52YWx1ZSwgcmVjdXJzZVRpbWVzIC0gMSk7XG4gICAgICB9XG4gICAgICBpZiAoc3RyLmluZGV4T2YoJ1xcbicpID4gLTEpIHtcbiAgICAgICAgaWYgKGFycmF5KSB7XG4gICAgICAgICAgc3RyID0gc3RyLnNwbGl0KCdcXG4nKS5tYXAoZnVuY3Rpb24obGluZSkge1xuICAgICAgICAgICAgcmV0dXJuICcgICcgKyBsaW5lO1xuICAgICAgICAgIH0pLmpvaW4oJ1xcbicpLnN1YnN0cigyKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBzdHIgPSAnXFxuJyArIHN0ci5zcGxpdCgnXFxuJykubWFwKGZ1bmN0aW9uKGxpbmUpIHtcbiAgICAgICAgICAgIHJldHVybiAnICAgJyArIGxpbmU7XG4gICAgICAgICAgfSkuam9pbignXFxuJyk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgc3RyID0gY3R4LnN0eWxpemUoJ1tDaXJjdWxhcl0nLCAnc3BlY2lhbCcpO1xuICAgIH1cbiAgfVxuICBpZiAoaXNVbmRlZmluZWQobmFtZSkpIHtcbiAgICBpZiAoYXJyYXkgJiYga2V5Lm1hdGNoKC9eXFxkKyQvKSkge1xuICAgICAgcmV0dXJuIHN0cjtcbiAgICB9XG4gICAgbmFtZSA9IEpTT04uc3RyaW5naWZ5KCcnICsga2V5KTtcbiAgICBpZiAobmFtZS5tYXRjaCgvXlwiKFthLXpBLVpfXVthLXpBLVpfMC05XSopXCIkLykpIHtcbiAgICAgIG5hbWUgPSBuYW1lLnN1YnN0cigxLCBuYW1lLmxlbmd0aCAtIDIpO1xuICAgICAgbmFtZSA9IGN0eC5zdHlsaXplKG5hbWUsICduYW1lJyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIG5hbWUgPSBuYW1lLnJlcGxhY2UoLycvZywgXCJcXFxcJ1wiKVxuICAgICAgICAgICAgICAgICAucmVwbGFjZSgvXFxcXFwiL2csICdcIicpXG4gICAgICAgICAgICAgICAgIC5yZXBsYWNlKC8oXlwifFwiJCkvZywgXCInXCIpO1xuICAgICAgbmFtZSA9IGN0eC5zdHlsaXplKG5hbWUsICdzdHJpbmcnKTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gbmFtZSArICc6ICcgKyBzdHI7XG59XG5cblxuZnVuY3Rpb24gcmVkdWNlVG9TaW5nbGVTdHJpbmcob3V0cHV0LCBiYXNlLCBicmFjZXMpIHtcbiAgdmFyIG51bUxpbmVzRXN0ID0gMDtcbiAgdmFyIGxlbmd0aCA9IG91dHB1dC5yZWR1Y2UoZnVuY3Rpb24ocHJldiwgY3VyKSB7XG4gICAgbnVtTGluZXNFc3QrKztcbiAgICBpZiAoY3VyLmluZGV4T2YoJ1xcbicpID49IDApIG51bUxpbmVzRXN0Kys7XG4gICAgcmV0dXJuIHByZXYgKyBjdXIucmVwbGFjZSgvXFx1MDAxYlxcW1xcZFxcZD9tL2csICcnKS5sZW5ndGggKyAxO1xuICB9LCAwKTtcblxuICBpZiAobGVuZ3RoID4gNjApIHtcbiAgICByZXR1cm4gYnJhY2VzWzBdICtcbiAgICAgICAgICAgKGJhc2UgPT09ICcnID8gJycgOiBiYXNlICsgJ1xcbiAnKSArXG4gICAgICAgICAgICcgJyArXG4gICAgICAgICAgIG91dHB1dC5qb2luKCcsXFxuICAnKSArXG4gICAgICAgICAgICcgJyArXG4gICAgICAgICAgIGJyYWNlc1sxXTtcbiAgfVxuXG4gIHJldHVybiBicmFjZXNbMF0gKyBiYXNlICsgJyAnICsgb3V0cHV0LmpvaW4oJywgJykgKyAnICcgKyBicmFjZXNbMV07XG59XG5cblxuLy8gTk9URTogVGhlc2UgdHlwZSBjaGVja2luZyBmdW5jdGlvbnMgaW50ZW50aW9uYWxseSBkb24ndCB1c2UgYGluc3RhbmNlb2ZgXG4vLyBiZWNhdXNlIGl0IGlzIGZyYWdpbGUgYW5kIGNhbiBiZSBlYXNpbHkgZmFrZWQgd2l0aCBgT2JqZWN0LmNyZWF0ZSgpYC5cbmZ1bmN0aW9uIGlzQXJyYXkoYXIpIHtcbiAgcmV0dXJuIEFycmF5LmlzQXJyYXkoYXIpO1xufVxuZXhwb3J0cy5pc0FycmF5ID0gaXNBcnJheTtcblxuZnVuY3Rpb24gaXNCb29sZWFuKGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ2Jvb2xlYW4nO1xufVxuZXhwb3J0cy5pc0Jvb2xlYW4gPSBpc0Jvb2xlYW47XG5cbmZ1bmN0aW9uIGlzTnVsbChhcmcpIHtcbiAgcmV0dXJuIGFyZyA9PT0gbnVsbDtcbn1cbmV4cG9ydHMuaXNOdWxsID0gaXNOdWxsO1xuXG5mdW5jdGlvbiBpc051bGxPclVuZGVmaW5lZChhcmcpIHtcbiAgcmV0dXJuIGFyZyA9PSBudWxsO1xufVxuZXhwb3J0cy5pc051bGxPclVuZGVmaW5lZCA9IGlzTnVsbE9yVW5kZWZpbmVkO1xuXG5mdW5jdGlvbiBpc051bWJlcihhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdudW1iZXInO1xufVxuZXhwb3J0cy5pc051bWJlciA9IGlzTnVtYmVyO1xuXG5mdW5jdGlvbiBpc1N0cmluZyhhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdzdHJpbmcnO1xufVxuZXhwb3J0cy5pc1N0cmluZyA9IGlzU3RyaW5nO1xuXG5mdW5jdGlvbiBpc1N5bWJvbChhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdzeW1ib2wnO1xufVxuZXhwb3J0cy5pc1N5bWJvbCA9IGlzU3ltYm9sO1xuXG5mdW5jdGlvbiBpc1VuZGVmaW5lZChhcmcpIHtcbiAgcmV0dXJuIGFyZyA9PT0gdm9pZCAwO1xufVxuZXhwb3J0cy5pc1VuZGVmaW5lZCA9IGlzVW5kZWZpbmVkO1xuXG5mdW5jdGlvbiBpc1JlZ0V4cChyZSkge1xuICByZXR1cm4gaXNPYmplY3QocmUpICYmIG9iamVjdFRvU3RyaW5nKHJlKSA9PT0gJ1tvYmplY3QgUmVnRXhwXSc7XG59XG5leHBvcnRzLmlzUmVnRXhwID0gaXNSZWdFeHA7XG5cbmZ1bmN0aW9uIGlzT2JqZWN0KGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ29iamVjdCcgJiYgYXJnICE9PSBudWxsO1xufVxuZXhwb3J0cy5pc09iamVjdCA9IGlzT2JqZWN0O1xuXG5mdW5jdGlvbiBpc0RhdGUoZCkge1xuICByZXR1cm4gaXNPYmplY3QoZCkgJiYgb2JqZWN0VG9TdHJpbmcoZCkgPT09ICdbb2JqZWN0IERhdGVdJztcbn1cbmV4cG9ydHMuaXNEYXRlID0gaXNEYXRlO1xuXG5mdW5jdGlvbiBpc0Vycm9yKGUpIHtcbiAgcmV0dXJuIGlzT2JqZWN0KGUpICYmXG4gICAgICAob2JqZWN0VG9TdHJpbmcoZSkgPT09ICdbb2JqZWN0IEVycm9yXScgfHwgZSBpbnN0YW5jZW9mIEVycm9yKTtcbn1cbmV4cG9ydHMuaXNFcnJvciA9IGlzRXJyb3I7XG5cbmZ1bmN0aW9uIGlzRnVuY3Rpb24oYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnZnVuY3Rpb24nO1xufVxuZXhwb3J0cy5pc0Z1bmN0aW9uID0gaXNGdW5jdGlvbjtcblxuZnVuY3Rpb24gaXNQcmltaXRpdmUoYXJnKSB7XG4gIHJldHVybiBhcmcgPT09IG51bGwgfHxcbiAgICAgICAgIHR5cGVvZiBhcmcgPT09ICdib29sZWFuJyB8fFxuICAgICAgICAgdHlwZW9mIGFyZyA9PT0gJ251bWJlcicgfHxcbiAgICAgICAgIHR5cGVvZiBhcmcgPT09ICdzdHJpbmcnIHx8XG4gICAgICAgICB0eXBlb2YgYXJnID09PSAnc3ltYm9sJyB8fCAgLy8gRVM2IHN5bWJvbFxuICAgICAgICAgdHlwZW9mIGFyZyA9PT0gJ3VuZGVmaW5lZCc7XG59XG5leHBvcnRzLmlzUHJpbWl0aXZlID0gaXNQcmltaXRpdmU7XG5cbmV4cG9ydHMuaXNCdWZmZXIgPSByZXF1aXJlKCcuL3N1cHBvcnQvaXNCdWZmZXInKTtcblxuZnVuY3Rpb24gb2JqZWN0VG9TdHJpbmcobykge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKG8pO1xufVxuXG5cbmZ1bmN0aW9uIHBhZChuKSB7XG4gIHJldHVybiBuIDwgMTAgPyAnMCcgKyBuLnRvU3RyaW5nKDEwKSA6IG4udG9TdHJpbmcoMTApO1xufVxuXG5cbnZhciBtb250aHMgPSBbJ0phbicsICdGZWInLCAnTWFyJywgJ0FwcicsICdNYXknLCAnSnVuJywgJ0p1bCcsICdBdWcnLCAnU2VwJyxcbiAgICAgICAgICAgICAgJ09jdCcsICdOb3YnLCAnRGVjJ107XG5cbi8vIDI2IEZlYiAxNjoxOTozNFxuZnVuY3Rpb24gdGltZXN0YW1wKCkge1xuICB2YXIgZCA9IG5ldyBEYXRlKCk7XG4gIHZhciB0aW1lID0gW3BhZChkLmdldEhvdXJzKCkpLFxuICAgICAgICAgICAgICBwYWQoZC5nZXRNaW51dGVzKCkpLFxuICAgICAgICAgICAgICBwYWQoZC5nZXRTZWNvbmRzKCkpXS5qb2luKCc6Jyk7XG4gIHJldHVybiBbZC5nZXREYXRlKCksIG1vbnRoc1tkLmdldE1vbnRoKCldLCB0aW1lXS5qb2luKCcgJyk7XG59XG5cblxuLy8gbG9nIGlzIGp1c3QgYSB0aGluIHdyYXBwZXIgdG8gY29uc29sZS5sb2cgdGhhdCBwcmVwZW5kcyBhIHRpbWVzdGFtcFxuZXhwb3J0cy5sb2cgPSBmdW5jdGlvbigpIHtcbiAgY29uc29sZS5sb2coJyVzIC0gJXMnLCB0aW1lc3RhbXAoKSwgZXhwb3J0cy5mb3JtYXQuYXBwbHkoZXhwb3J0cywgYXJndW1lbnRzKSk7XG59O1xuXG5cbi8qKlxuICogSW5oZXJpdCB0aGUgcHJvdG90eXBlIG1ldGhvZHMgZnJvbSBvbmUgY29uc3RydWN0b3IgaW50byBhbm90aGVyLlxuICpcbiAqIFRoZSBGdW5jdGlvbi5wcm90b3R5cGUuaW5oZXJpdHMgZnJvbSBsYW5nLmpzIHJld3JpdHRlbiBhcyBhIHN0YW5kYWxvbmVcbiAqIGZ1bmN0aW9uIChub3Qgb24gRnVuY3Rpb24ucHJvdG90eXBlKS4gTk9URTogSWYgdGhpcyBmaWxlIGlzIHRvIGJlIGxvYWRlZFxuICogZHVyaW5nIGJvb3RzdHJhcHBpbmcgdGhpcyBmdW5jdGlvbiBuZWVkcyB0byBiZSByZXdyaXR0ZW4gdXNpbmcgc29tZSBuYXRpdmVcbiAqIGZ1bmN0aW9ucyBhcyBwcm90b3R5cGUgc2V0dXAgdXNpbmcgbm9ybWFsIEphdmFTY3JpcHQgZG9lcyBub3Qgd29yayBhc1xuICogZXhwZWN0ZWQgZHVyaW5nIGJvb3RzdHJhcHBpbmcgKHNlZSBtaXJyb3IuanMgaW4gcjExNDkwMykuXG4gKlxuICogQHBhcmFtIHtmdW5jdGlvbn0gY3RvciBDb25zdHJ1Y3RvciBmdW5jdGlvbiB3aGljaCBuZWVkcyB0byBpbmhlcml0IHRoZVxuICogICAgIHByb3RvdHlwZS5cbiAqIEBwYXJhbSB7ZnVuY3Rpb259IHN1cGVyQ3RvciBDb25zdHJ1Y3RvciBmdW5jdGlvbiB0byBpbmhlcml0IHByb3RvdHlwZSBmcm9tLlxuICovXG5leHBvcnRzLmluaGVyaXRzID0gcmVxdWlyZSgnaW5oZXJpdHMnKTtcblxuZXhwb3J0cy5fZXh0ZW5kID0gZnVuY3Rpb24ob3JpZ2luLCBhZGQpIHtcbiAgLy8gRG9uJ3QgZG8gYW55dGhpbmcgaWYgYWRkIGlzbid0IGFuIG9iamVjdFxuICBpZiAoIWFkZCB8fCAhaXNPYmplY3QoYWRkKSkgcmV0dXJuIG9yaWdpbjtcblxuICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKGFkZCk7XG4gIHZhciBpID0ga2V5cy5sZW5ndGg7XG4gIHdoaWxlIChpLS0pIHtcbiAgICBvcmlnaW5ba2V5c1tpXV0gPSBhZGRba2V5c1tpXV07XG4gIH1cbiAgcmV0dXJuIG9yaWdpbjtcbn07XG5cbmZ1bmN0aW9uIGhhc093blByb3BlcnR5KG9iaiwgcHJvcCkge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwgcHJvcCk7XG59XG4iXX0=
