export namespace evalconfig {
	
	export class KV {
	    key: string;
	    value: string;
	
	    static createFrom(source: any = {}) {
	        return new KV(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.key = source["key"];
	        this.value = source["value"];
	    }
	}
	export class Assertion {
	    type: string;
	    value: string;
	    threshold: string;
	    weight: string;
	    metric: string;
	    config: KV[];
	
	    static createFrom(source: any = {}) {
	        return new Assertion(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.type = source["type"];
	        this.value = source["value"];
	        this.threshold = source["threshold"];
	        this.weight = source["weight"];
	        this.metric = source["metric"];
	        this.config = this.convertValues(source["config"], KV);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class TestCase {
	    file: string;
	    description: string;
	    vars: KV[];
	    options: KV[];
	    assert: Assertion[];
	
	    static createFrom(source: any = {}) {
	        return new TestCase(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.file = source["file"];
	        this.description = source["description"];
	        this.vars = this.convertValues(source["vars"], KV);
	        this.options = this.convertValues(source["options"], KV);
	        this.assert = this.convertValues(source["assert"], Assertion);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Provider {
	    id: string;
	    label: string;
	    config: KV[];
	
	    static createFrom(source: any = {}) {
	        return new Provider(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.label = source["label"];
	        this.config = this.convertValues(source["config"], KV);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Prompt {
	    label: string;
	    raw: string;
	
	    static createFrom(source: any = {}) {
	        return new Prompt(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.label = source["label"];
	        this.raw = source["raw"];
	    }
	}
	export class Config {
	    description: string;
	    prompts: Prompt[];
	    providers: Provider[];
	    defaultTest: TestCase;
	    tests: TestCase[];
	    outputPath: string;
	    extra: string;
	
	    static createFrom(source: any = {}) {
	        return new Config(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.description = source["description"];
	        this.prompts = this.convertValues(source["prompts"], Prompt);
	        this.providers = this.convertValues(source["providers"], Provider);
	        this.defaultTest = this.convertValues(source["defaultTest"], TestCase);
	        this.tests = this.convertValues(source["tests"], TestCase);
	        this.outputPath = source["outputPath"];
	        this.extra = source["extra"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	

}

export namespace examples {
	
	export class Example {
	    id: string;
	    title: string;
	    summary: string;
	    kit: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Example(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.summary = source["summary"];
	        this.kit = source["kit"];
	    }
	}

}

export namespace kit {
	
	export class Status {
	    dir: string;
	    inHomeDir: boolean;
	    used: boolean;
	    missing: string[];
	    hasPackageJSON: boolean;
	    hasNodeModules: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Status(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.dir = source["dir"];
	        this.inHomeDir = source["inHomeDir"];
	        this.used = source["used"];
	        this.missing = source["missing"];
	        this.hasPackageJSON = source["hasPackageJSON"];
	        this.hasNodeModules = source["hasNodeModules"];
	    }
	}

}

export namespace main {
	
	export class OpenResult {
	    path: string;
	    config: evalconfig.Config;
	
	    static createFrom(source: any = {}) {
	        return new OpenResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.config = this.convertValues(source["config"], evalconfig.Config);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace promptfile {
	
	export class File {
	    ref: string;
	    templated: boolean;
	    path: string;
	    content: string;
	    error: string;
	
	    static createFrom(source: any = {}) {
	        return new File(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ref = source["ref"];
	        this.templated = source["templated"];
	        this.path = source["path"];
	        this.content = source["content"];
	        this.error = source["error"];
	    }
	}

}

export namespace toolchain {
	
	export class Status {
	    nodePath: string;
	    nodeVersion: string;
	    nodeOK: boolean;
	    nodeManaged: boolean;
	    minNode: string;
	    promptfooVersion: string;
	    promptfooPath: string;
	    dataDir: string;
	
	    static createFrom(source: any = {}) {
	        return new Status(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.nodePath = source["nodePath"];
	        this.nodeVersion = source["nodeVersion"];
	        this.nodeOK = source["nodeOK"];
	        this.nodeManaged = source["nodeManaged"];
	        this.minNode = source["minNode"];
	        this.promptfooVersion = source["promptfooVersion"];
	        this.promptfooPath = source["promptfooPath"];
	        this.dataDir = source["dataDir"];
	    }
	}

}

