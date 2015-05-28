#!/usr/bin/env node

var mongojs = require("mongojs");
var moment = require("moment");
var debug = require("debug")("importer:parteispenden13");
var async = require("async");
var path = require("path");
var slug = require("slug");
var fs = require("fs");

// load config
var config = require(path.resolve(__dirname, "../config.js"));

// load mongojs 
var db = mongojs(config.db, ["entities","relations"]);

// local modules
var api = require(path.resolve(__dirname, "../lib/api.js"))(config.api, db);

// load data
var data = JSON.parse(fs.readFileSync(path.resolve(__dirname, "data/parteispenden13.json")));

// importer
var execute = function(finish){

	var q = async.queue(function(fn, next){
		fn(next);
	},1);

	q.drain = function(){
		debug("importer done");
		finish();
	};

	data.forEach(function(set){
		
		// create entity
		var ent = {
			importer: "parteispenden13",
			created: (new Date()),
			updated: (new Date()),
			type: ((set.type === "person") ? "person" : "entity"),
			tags: "parteispenden13",
			name: set.name,
			aliases: set.alias.filter(function(a){ return (a !== ""); }),
			data: [{
				key: "source",
				value: {
					url: set.source_url,
					remark: "Die Welt - "+set.source_label
				},
				desc: "Quelle",
				format: "link",
				auto: true,
				created: (new Date()),
				updated: (new Date())
			},{
				key: "address",
				value: {
					type: 'main',
					name: set.name,
					addr: set.zusatz,
					street: set.adresse,
					postcode: set.plz,
					city: set.stadt,
					country: "Germany"
				},
				desc: "Adresse",
				format: "address",
				auto: true,
				created: (new Date()),
				updated: (new Date())
			}]
		};

		if (set.type === "person") {
			ent.data.push({
				key: "surname",
				value: set.nachname,
				desc: "Nachname",
				format: "string",
				auto: true,
				created: (new Date()),
				updated: (new Date())
			});
			ent.data.push({
				key: "names",
				value: set.vorname,
				desc: "Vornamen",
				format: "string",
				auto: true,
				created: (new Date()),
				updated: (new Date())
			});
		};

		if (set.title !== "" && set.title !== null) set.title.split(/\s+/g).forEach(function(t){
			ent.data.push({
				key: "titles",
				value: t,
				desc: "Titel",
				format: "string",
				auto: true,
				created: (new Date()),
				updated: (new Date())
			});
		});

		q.push(function(next){
			api.ent_creaxtend(ent, function(err, ent_id){
				next();

				if (err) return debug("error: %s", err);
				debug("entity created %s", ent.name);

				// partei
				debug("creating party %s", set.partei);
			
				var ent_partei = {
					importer: "parteispenden13",
					created: (new Date()),
					updated: (new Date()),
					type: "entity",
					tags: ["partei"],
					name: set.partei,
					aliases: [],
					data: [{
						key: "partei",
						value: set.partei,
						desc: "Partei",
						format: "string",
						auto: true,
						created: (new Date()),
						updated: (new Date())
					}]
				};
			
				q.push(function(nxt){
					api.ent_creaxtend(ent_partei, function(err, party_id){
						nxt();

						if (err) return debug("error: %s", err);
						debug("entity created %s", ent.name);

						// create relation person ↔ partei
						q.push(function(nx){
							api.rel_creaxtend({
								importer: "parteispenden13",
								entities: [ent_id, party_id],
								type: "donation",
								tags: ["partei","spende","parteispende"],
								weight: 1,
								data: [{
									key: "source",
									value: {
										url: set.source_url,
										remark: "Bundestag "+set.source_label
									},
									desc: "Quelle",
									format: "link",
									auto: true,
									created: (new Date()),
									updated: (new Date())
								},{
									key: "donation",
									value: {
										year: set.jahr,
										amount: set.betrag
									},
									desc: "Parteispende",
									format: "donation",
									auto: true,
									created: (new Date()),
									updated: (new Date())
								}]
							}, function(err, rel_id){
								if (err) return (debug("error: %s", err) || nx());
								debug("relation created %s → %s", ent.name, ent_partei.name);
								nx();
							});
						});
					});
				});
			});
		});
	});
};

if (module.parent === null) {
	// execute in standalone mode
	execute(function(){
		debug("import finished");
		process.exit();
	});
} else {
	// export in required mode
	module.exports = execute;
};
